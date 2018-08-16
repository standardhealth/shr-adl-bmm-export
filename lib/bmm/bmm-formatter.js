/*
//  /$$$$$$$$                                               /$$       /$$
// | $$_____/                                              | $$      | $$
// | $$        /$$$$$$   /$$$$$$  /$$$$$$/$$$$   /$$$$$$  /$$$$$$   /$$$$$$    /$$$$$$   /$$$$$$
// | $$$$$    /$$__  $$ /$$__  $$| $$_  $$_  $$ |____  $$|_  $$_/  |_  $$_/   /$$__  $$ /$$__  $$
// | $$__/   | $$  \ $$| $$  \__/| $$ \ $$ \ $$  /$$$$$$$  | $$      | $$    | $$$$$$$$| $$  \__/
// | $$      | $$  | $$| $$      | $$ | $$ | $$ /$$__  $$  | $$ /$$  | $$ /$$| $$_____/| $$
// | $$      |  $$$$$$/| $$      | $$ | $$ | $$|  $$$$$$$  |  $$$$/  |  $$$$/|  $$$$$$$| $$
// |__/       \______/ |__/      |__/ |__/ |__/ \_______/   \___/     \___/   \_______/|__/
//
// Formatter - BMM
// Abhijay Bhatnagar
// 05/01/18
*/


class BmmFormatter {
  constructor(bmmSpecs) {
    this.bmmSpecs = bmmSpecs;
  }

  format() {
    const formattedHeader = this.formatDocHeader();
    const formattedArchetypes = this.formatArchetypes();

    //TODO: see if undoing the mapping and formatting afterwards works instead...
    const output = [formattedHeader, formattedArchetypes].map(s => this.formatIdentation(s)).join('\n');

    return output;
  }

  formatDocHeader() {
    const bmmVersion = `2.1`;
    const rm_publisher = 'SHR';
    const schema_name = 'RM_CLINICAL';
    const rm_release = '0.0.1';

    //figure out archetyping includes

    const formattedHeader =
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
        `;
    return formattedHeader;
  }

  formatArchetypes() {
    const formattedPackages = this.formatPackages();
    const formattedDefinitions = this.formatDefinitions();

    const formattedArchetypes =
      `
      -- ----------------------------------
      -- archetyping
      -- ----------------------------------
      archetype_rm_closure_packages = <"${Object.keys(this.bmmSpecs.packages).map(ns => `SHR_CLINICAL.${ns}`).join(', ')}">
      includes = <
        ["1"] = <
          id = <"shr_rm_primitives_0.0.1">
        >
      >
      ${formattedPackages}
      ${formattedDefinitions}
      `;
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

    const formattedPackages =
        `packages = <
          ["SHR_Clinical"] = <
            name = <"SHR_Clinical">
            packages = <
              ${formattedPkgs.join('\n')}
            >
          >
        >`;

    return formattedPackages;
  }


  formatDefinitions() {
    const formattedDefs = [];
    for (const de in this.bmmSpecs.definitions) {
      const def = this.bmmSpecs.definitions[de];
      const formattedDef = [
        `["${de}"] = <`,
        `\tdocumentation = <"${(def.documentation) ? def.documentation : '-'}">`,
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

    const formattedDefinitions =
      `
      class_definitions = <
        ${formattedDefs.join('\n')}
      >
      `;

    return formattedDefinitions;
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

  //A top level function that handles the left padding of the formatted BMM
  //The internal function manageScoping() handles the scoping levels as determined
  //by the ADL scoping operators: "<", ">", """, "|"
  formatIdentation(bmmOutput) {
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

    const reformattedOutput = bmmOutput.split('\n').map(line => {
      line = line.replace(/^\s*/, '');
      line = `${'\t'.repeat(Math.max(0, currentIndentLevel))}${line}`;

      if (line.replace(/^\s*/, '') == '>' && !inQuotes) {
        line = line.replace(/^\t/, '');
      }

      //The RegEx replacement /[^<>"|]/ removes all characters except
      //those that affect scoping in BMM, i.e: <, >, ", |
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

    return reformattedOutput;
  }
}

module.exports = { BmmFormatter };