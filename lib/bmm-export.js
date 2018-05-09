const bunyan = require('bunyan');
const dedent = require('dedent-js');
// const dedent = require('dedent');
const fs = require('fs');
const mkdirp = require('mkdirp');

// const fs = require('fs');
// const path = require('path');

var rootLogger = bunyan.createLogger({ name: 'shr-adl-export' });
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

function exportToBmm(specs, config) {
  const exporter = new BmmExporter(specs, config);
  return exporter.export();
}

// const TAB_SIZE = 2;

Array.prototype.indentStrings = function indentStrings() {
  return this.map(i => (i.constructor.name == 'String') ? `\t${i}` : i);
};

const formatId = (idArray, type) => {
  return `[${type}${idArray.join('.')}]`;
};

const makeCamlCased = (string) => {
  return string.charAt(0).toLowerCase() + string.slice(1);
};

function reformatNamespace(ns) {
  return ns.split('.').map(partial=>partial.charAt(0).toUpperCase() + partial.slice(1)).join('');
}

//A top level function that handles the left padding of the formatted BMM
//The internal function manageScoping() handles the scoping levels as determined
//by the ADL scoping operators: "<", ">", """, "|"
function formatIdentation(bmmOutput) {
  let currentIndentLevel = 0;
  let stack = [];
  let inQuotes = false;
  let inCardDef = false;

  const manageScoping = (scopingChars) => {
    for (const c of scopingChars) {
      let firstItem = false;
      if (stack.length == 0) {
        stack.push(c);
        firstItem = true;
      }

      const stackTop = stack.slice(-1)[0];
      let shouldPopStack = false;
      switch (c) {
      case '"':
        if (stackTop == '"' && !firstItem) {
          inQuotes = false;
          shouldPopStack = true;
        } else {
          stack.push(c);
          inQuotes = true;
        }
        break;
      case '>':
        if (!inQuotes && !inCardDef) {
          if (stackTop == '<' && !firstItem) {
            shouldPopStack = true;
            currentIndentLevel -= 1;
            // continue;
          } else {
            stack.push(c);
          }
        }
        break;
      case '<':
        if (!inQuotes && !inCardDef) {
          if (!firstItem) {
            stack.push(c);
          }
          currentIndentLevel += 1;
        }
        break;
      case '|':
        if (!inQuotes) {
          if (stackTop == '|') {
            inCardDef = false;
            shouldPopStack = true;
          } else {
            stack.push(c);
            inCardDef = true;
          }
        }
        break;
      default:
        break;
      }

      if (shouldPopStack && !firstItem) {
        stack.pop();
      }
    }
  };

  return bmmOutput.split('\n').map(line => {
    line = line.replace(/^\s*/, '');
    if (line.replace(/\s/g, '') == '>' && !inQuotes) {
      line = `${'\t'.repeat(Math.max(0,currentIndentLevel - 1))}${line}`;
    } else {
      line = `${'\t'.repeat(Math.max(0,currentIndentLevel))}${line}`;
    }

    const scopingChars = line.replace(/[^<>"|]/g, '');
    manageScoping(scopingChars);

    // Deprecated Code:
    //
    // } else if (bracketDifference < 0) {
    //   currentIndentLevel = currentIndentLevel + bracketDifference;
    //   if (currentIndentLevel < 0) {
    //     currentIndentLevel = 0;
    //     line = `${'\t'.repeat(10)}${line}`;
    //   } else {
    //     line = `${'\t'.repeat(currentIndentLevel)}${line}`;
    //   }
    // }
    // const strippedLine = line.replace(/<"[\S\s]*">/g, '<"">');
    // const bracketDifference = ((strippedLine.match(/</g) || []).length - (strippedLine.match(/>/g) || []).length);
    // line = strippedLine;
    // if (line.match(/<\s*/)) {
    //   line = `${'\t'.repeat(currentIndentLevel)}${line}`;
    //   currentIndentLevel = currentIndentLevel + 1;
    // }
    return line;
  }).join('\n');
}

class BmmExporter {
  constructor(specs, config) {
    this._specs = specs;
    this._config = config;
  }

  get specs() { return this._specs; }
  get config() { return this._config; }

  export() {
    const bmmSpecs = new BmmSpecs(this.specs, this.config).bmmSpecs;
    const formatter = new BmmFormatter(bmmSpecs);

    return formatter.format();
  }
}


class BmmSpecs {
  constructor(specs, config) {
    this._specs = specs;
    this._config = config;
    this.bmmSpecs = {
      packages: this.constructPackages(),
      definitions: this.constructDefinitions()
    };
  }

  get specs() { return this._specs; }
  get config() { return this._config; }

  constructBmmSpecs() {
    this.constructPackages();
  }

  constructPackages() {
    const packages = {};
    for (const ns of this.specs.namespaces.all) {
      const namespace = reformatNamespace(ns.namespace);
      const elements = this.specs.dataElements.byNamespace(ns.namespace);
      packages[namespace] = elements;
    }
    return packages;
  }

  constructDefinitions() {
    const definitions = {};
    for (const de of this.specs.dataElements.all) {
      const name = de.identifier.name;
      const properties = this.constructProperties(de);
      definitions[name] = {
        name: name,
        documentation: de.description,
        ancestors: de.basedOn,
      };
      if (Object.keys(properties).length > 0) {
        definitions[name].properties = properties;
      }
    }
    return definitions;
  }

  constructProperties(de) {
    const properties = {};
    for (const f of de.fields.filter(v=>v.inheritance == null)) {
      if (f.identifier !== null) {
        if (f.constraintsFilter.includesType.hasConstraints || f.constraintsFilter.includesCode.hasConstraints) {
          continue;
        }

        const fDef = this.specs.dataElements.findByIdentifier(f.identifier);

        const documentation = fDef.description;
        const name = makeCamlCased(f.identifier.name);
        const type = f.identifier.name;
        const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

        if (f.identifier.namespace == 'primitive') {
          const a = 'b';
        }
        properties[name] = {
          p_bmm_type: p_bmm_type,
          name: name,
          type: type,
          documentation: documentation
        };

        if (f.effectiveCard.toString().charAt(0) == 1) {
          const is_mandatory = 'True';
          properties[name].is_mandatory = is_mandatory;
        }

        if (f.effectiveCard.toString() !== '0..1') {
          const cardinality = f.effectiveCard;
          properties[name].cardinality = cardinality;
        }
      } else if (f.constructor.name == 'ChoiceValue') {
        console.log('unsupported choices in fields');
      }
    }

    if (de.value && de.value.inheritance == null) {
      if (de.value.identifier) {
        const v = de.value;

        const name = 'value';
        const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

        properties[name] = {
          p_bmm_type: p_bmm_type,
          name: name,
        };

        if (v.identifier.namespace == 'primitive') {
          let documentation = `PrimitiveValue (original type: ${v.identifier.name})`;
          let type = 'Any';

          type = v.identifier.name;
          // const conversionTable = {
          //   code: 'CodedText',
          //   string: 'String',
          //   dateTime: 'DateTime',
          //   decimal: 'Quantity',
          //   uri: 'URI',
          //   boolean: 'Boolean',
          //   time: 'Time'
          // };
          // if (v.identifier.name in conversionTable) {
          //   type = conversionTable[v.identifier.name];
          // } else {
          //   console.log('unhandled prmitive %s', v.identifier.name);
          //   documentation = `Unsupported Primitive ${v.identifier.name}`;
          //   type = 'CodedText';
          // }
          properties[name].documentation = documentation;
          properties[name].type = type;
        } else {
          const vDef = this.specs.dataElements.findByIdentifier(v.identifier);
          const documentation = vDef.description;
          const type = v.identifier.name;

          properties[name].documentation = documentation;
          properties[name].type = type;
        }

        if (v.effectiveCard.toString().charAt(0) == 1) {
          const is_mandatory = 'True';
          properties[name].is_mandatory = is_mandatory;
        }

        if (v.effectiveCard.toString() !== '0..1') {
          const cardinality = v.effectiveCard;
          properties[name].cardinality = cardinality;
        }
      } else if (de.value.constructor.name == 'ChoiceValue') {
        for (const opt of de.value.options) {
          const name = `valueChoice${opt.identifier.name}`;
          const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

          properties[name] = {
            p_bmm_type: p_bmm_type,
            name: name,
          };

          if (opt.identifier.namespace == 'primitive') {
            let documentation = `PrimitiveValue (original type: ${opt.identifier.name})`;
            let type = 'Any';

            type = opt.identifier.name;
            // const conversionTable = {
            //   code: 'CodedText',
            //   string: 'String',
            //   dateTime: 'DateTime',
            //   decimal: 'Quantity',
            //   uri: 'URI',
            //   boolean: 'Boolean',
            //   time: 'Time'
            // };
            // if (opt.identifier.name in conversionTable) {
            //   type = conversionTable[opt.identifier.name];
            // } else {
            //   console.log('unhandled prmitive %s', opt.identifier.name);
            //   documentation = `Unsupported Primitive ${opt.identifier.name}`;
            //   type = 'CodedText';
            // }

            properties[name].documentation = documentation;
            properties[name].type = type;

          } else {
            const vDef = this.specs.dataElements.findByIdentifier(opt.identifier);
            const documentation = vDef.description;
            const type = opt.identifier.name;

            properties[name].documentation = documentation;
            properties[name].type = type;
          }

          if (opt.effectiveCard.toString().charAt(0) == 1) {
            const is_mandatory = 'True';
            properties[name].is_mandatory = is_mandatory;
          }

          if (opt.effectiveCard.toString() !== '0..1') {
            const cardinality = opt.effectiveCard;
            properties[name].cardinality = cardinality;
          }
        }
      }
    }

    return properties;
  }
}

class BmmFormatter {
  constructor(bmmSpecs) {
    this.bmmSpecs = bmmSpecs;
  }

  format() {
    const formattedHeader = this.formatDocHeader();
    const formattedArchetypes = this.formatArchetypes();

    const output = [formattedHeader, formattedArchetypes].map(s=>formatIdentation(s)).join('\n');

    return output;
  }

  formatDocHeader() {
    const bmmVersion = `2.1`;
    const rm_publisher = 'SHR';
    const schema_name = 'RM_CLINICAL';
    const rm_release = '0.0.1';

    //figure out archetyping includes

    const formattedHeader = dedent(
      `-- Basic Metamodel Syntax Version
      bmm_version = <"${bmmVersion}">

      -- ----------------------------------
      -- schema identification
      -- (schema_id computed as <rm_publisher>_<schema_name>_<rm_release>)
      -- ----------------------------------
      rm_publisher = <"${rm_publisher}">
      schema_name = <"${schema_name}">
      rm_release = <"${rm_release}">
      model_name = <"CORE">

      -- ----------------------------------
      -- schema documentation
      -- ----------------------------------
      schema_revision = <"Fri Jul 28 17:57:05 PDT 2017">
      schema_lifecycle_state = <"dstu">
      schema_description = <"${schema_name}.v${rm_release} - Schema generated from CIMPL">
      `);
    return formattedHeader;
  }

  formatArchetypes() {
    const formattedPackages = this.formatPackages();
    const formattedDefinitions = this.formatDefinitions();

    const formattedArchetypes = dedent(
      `
    -- ----------------------------------
    -- archetyping
    -- ----------------------------------
    archetype_rm_closure_packages = <"${Object.keys(this.bmmSpecs.packages).map(ns => `SHR_CLINICAL.${ns}`).join(', ')}">
    includes = <
      ["1"] = <
        id = <"cimi_rm_core_0.0.5">
      >
      ["2"] = <
        id = <"cimi_rm_foundation_0.0.5">
      >
    >
    ${formattedPackages}
    ${formattedDefinitions}
    `);
    return formattedArchetypes;
  }

  formatPackages() {
    const formattedPkgs = [];
    for (const ns in this.bmmSpecs.packages) {
      const pkgs = this.bmmSpecs.packages[ns];
      const formattedPkg = [
        `["${ns}"] = <`,
        `   name = <"${ns}">`,
        `   classes = <${pkgs.map(de => `"${de.identifier.name}"`).join(', ')}>`,
        `>`
      ];
      formattedPkgs.push(...formattedPkg);
    }

    const formattedPackages = dedent(`
      packages = <
        ["SHR_Clinical"] = <
          name = <"SHR_Clinical">
          packages = <
            ${formattedPkgs.join('\n')}
          >
        >
      >
      `);

    return formattedPackages;
  }


  formatDefinitions() {
    const formattedDefs = [];
    for (const de in this.bmmSpecs.definitions) {
      const def = this.bmmSpecs.definitions[de];
      const formattedDef = [
        `["${de}"] = <`,
        `\tdocumentation = <"${def.documentation}">`,
        `\tname = <"${de}">`,
      ];
      if (def.ancestors.length > 0) {
        formattedDef.push(`\tancestors = <${def.ancestors.map(a => `"${a.name}"`).join(',')}, ...>`);
      }
      if ('properties' in def) {
        formattedDef.push(...this.formatProperties(def.properties));
      }
      formattedDef.push(`>`);
      formattedDefs.push(...formattedDef.filter(l => l != undefined));
    }

    return dedent(
      `class_definitions = <
      ${formattedDefs.join('\n')}
      >
      `);
  }

  formatProperties(properties) {
    const formattedProps = [];
    for (const p in properties) {
      const prop = properties[p];
      const formattedProperty = [
        `["${prop.name}"] = (${prop.p_bmm_type}) <`,
        `documentation = <"${prop.documentation}">`,
        `name = <"${prop.name}">`,
      ];
      if ('type' in prop) {
        formattedProperty.push(`type = <"${prop.type}">`);
      } else if ('type_def' in prop) {
        //do nothing for now
      }

      if ('is_mandatory' in prop) {
        formattedProperty.push(`is_mandatory = <${prop.is_mandatory}>`);
      }

      if ('cardinality' in prop) {
        formattedProperty.push(`cardinality = <|${this.formatCardinality(prop.cardinality)}|>`);
      }

      formattedProperty.push('>');

      formattedProps.push(...formattedProperty);
    }
    return [
      `properties = <`,
      ...formattedProps,
      `>`
    ];
  }

  formatCardinality(card) {
    if (!card.max) {
      return `>=${card.min}`;
    } else {
      return `${card.min}..${card.max}`;
    }
  }

}


module.exports = { exportToBmm, setLogger };