const bunyan = require('bunyan');
const BmmExporter = require('./bmm-export');
// const fs = require('fs');
// const path = require('path');

var rootLogger = bunyan.createLogger({name: 'shr-adl-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

function exportToADL(specs, config) {
  const exporter = new ADLExporter(specs, config);
  return exporter.export();
}

function exportToBMM(specs, config) {
  return BmmExporter.exportToBmm(specs,config);
}

const TAB_SIZE = 2;

Array.prototype.indentStrings = function indentStrings() {
  return this.map(i => (i.constructor.name == 'String') ? `\t${i}` : i);
};

const formatId = (idArray, type) => {
  return `[${type}${idArray.join('.')}]`;
};

const makeCamlCased = (string) => {
  return string.charAt(0).toLowerCase() + string.slice(1);
};

// function indentWithTabs()

class ADLExporter {
  constructor(specs, config) {
    this._specs = specs;
    this._config = config;
  }

  get specs() { return this._specs; }
  get config() { return this._config; }


  export() {
    const formatter = new DataElementADLFormatter(this.specs, this.config);

    const entries = this.specs.dataElements.entries;
    const parents = Array.from(new Set(Array.prototype.concat.apply([], entries.map(de => de.hierarchy)))).filter(p=>!entries.some(de=>de.identifier.fqn == p)).map(p=>this.specs.dataElements.all.find(de=>de.identifier.fqn==p));
    const formattedFiles = {};
    for (const de of [...entries, ...parents]) {
      const adlEl = new AdlElement(de, this.specs, this.config);
      formattedFiles[adlEl.name] = formatter.format(adlEl);
    }
    return formattedFiles;
  }
}

class AdlElement {
  constructor(dataElement, specs, config) {
    this._specs = specs;
    this._config = config;
    this._dataElement = dataElement;

    //this._archetype;
    //this._language;
    this.termConstraints = [];
    this.termDefinitions = {};
    this.termBindings = [];
    this.fields = [];

    this.name = dataElement.identifier.name;
    this.namespace = dataElement.identifier.namespace;
    this.description = dataElement.description;
    this.construct(dataElement);
  }

  get specs() { return this._specs; }
  get config() { return this._config; }
  get dataElement() { return this._dataElement; }

  get combinedFieldsAndValue() {
    const combinedFieldsAndValue = [];
    if (this.dataElement.fields) combinedFieldsAndValue.push(...this.dataElement.fields);
    if (this.dataElement.value) combinedFieldsAndValue.push(this.dataElement.value);
    return combinedFieldsAndValue;
  }

  construct(dataElement) {
    this.constructTermDefinitions(dataElement);
    this.constructTermBindings(dataElement);
    this.constructConstraintDefinitions(dataElement);
  }


  constructTermDefinitions(de) {
    const idDefs = this.constructIdTermDefs(de);
    if (idDefs) this.termDefinitions['id'] = idDefs;

    const acDefs = this.constructAcTermDefs(de);
    if (acDefs) this.termDefinitions['ac'] = acDefs;

    const atDefs = this.constructAtTermDefs(de);
    if (atDefs) this.termDefinitions['at'] = atDefs;
  }

  constructIdTermDefs(de) {
    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;
    const elementDeclarationDef = new TermDefinition(de.identifier.name, de.description, Array(hierarchialDepth).fill(1), 'id', de);

    const idDefs = [elementDeclarationDef];
    const newFieldDefs = this.combinedFieldsAndValue.filter(f => !f.inheritance && f.identifier);
    var numbering = 1;
    for (const f of newFieldDefs) {
      const fieldElementDefinition = this.specs.dataElements.findByIdentifier(f.identifier);
      const adlField = new ADLField(fieldElementDefinition);

      // let sourceValue;
      // if (fieldElementDefinition.value) {
      //   sourceValue = this.specs.dataElements.findByIdentifier(fieldElementDefinition.value.identifier);
      // } else {
      let sourceValue = fieldElementDefinition;
      // }
      const atFieldDef = new TermDefinition(sourceValue.identifier.name, sourceValue.description, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'id', f);

      this.fields.push(adlField);
      idDefs.push(atFieldDef);
    }

    return idDefs;
  }

  //Local Value Sets [ac = archetype constraints]
  constructAcTermDefs(de) {
    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;

    const acDefs = [];
    const fieldsWithVS = this.combinedFieldsAndValue.filter(f => f.constraintsFilter.valueSet.hasConstraints);
    var numbering = 1;
    for (const f of fieldsWithVS) {
      for (const c of f.constraintsFilter.valueSet.constraints) {
        if (c.lastModifiedBy.equals(de.identifier) && !acDefs.find(d => d.name == c.valueSet)) {
          const acDef = new TermDefinition(c.valueSet, '-', [...Array(hierarchialDepth - 1).fill(0), numbering++], 'ac', c);
          acDefs.push(acDef);
        }
      }
    }

    return acDefs;
  }

  //Local Terms/Codes [at = archetype terms]
  constructAtTermDefs(de) {
    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;

    const atDefs = [];
    const fieldsWithCodes = this.combinedFieldsAndValue.filter(f => f.constraintsFilter.hasConstraints);
    var numbering = 1;
    for (const f of fieldsWithCodes) {
      for (const c of f.constraints) {
        if (c.code) {
          const code = c.code;
          if (c.lastModifiedBy.equals(de.identifier) && !atDefs.find(d => d.name == code.code)) {
            const atDef = new TermDefinition(code.code, code.display, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'at', c);
            atDefs.push(atDef);
          }
        }
      }
    }

    return atDefs;
  }

  //bind to specific codes
  constructTermBindings(de) {
    const combinedFieldsAndValue = [];
    if (de.fields) combinedFieldsAndValue.push(...de.fields);
    if (de.value) combinedFieldsAndValue.push(de.value);

    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;

    const bindings = [];
    const fieldsWithConstraints = combinedFieldsAndValue.filter(f => f.constraintsFilter.hasConstraints);
    var numbering = 1;
    for (const f of fieldsWithConstraints) {
      for (const c of f.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          if (c.constructor.name == 'ValueSetConstraint') {
            // const termDef = this.termDefinitions.id
            let binding = new TermBinding(c.valueSet.match(/(\w*)\.\w*/)[1], c.valueSet, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'id');
            bindings.push(binding);
          } else if (c.constructor.name == 'CodeConstraint') {
            let binding = new TermBinding(c.code.system.match(/(\w*)\.\w*/)[1], c.code.code, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'id');
            bindings.push(binding);
          }
        }
      }
    }

    this.termBindings = bindings;
  }

  constructConstraintDefinitions(de) {
    const termConstraints = [];

    //Construct new definition bases
    if (this.termDefinitions.id) {
      for (const def of this.termDefinitions.id) {
        if (!def.isSourceDef()) {
          // const camlCasedName = makeCamlCased(def.name);
          const termDefField = this.fields.find(f => f.identifier.name == def.sourceCimpl.identifier.name);
          const newDefConstraint = new TermConstraintBase(termDefField);
          const newTermTypeCst = new ADLTypeConstraint(termDefField, def);
          newDefConstraint.subConstraints.push(newTermTypeCst);
          termConstraints.push(newDefConstraint);
        }
      }
    }


    for (const f of this.combinedFieldsAndValue) {
      if (!f.identifier) continue;
      // Construct ref
      if (f.constructor.name == 'RefValue' || f.constructor.name == 'ChoiceValue') {
        continue; //no refs dont bother making work
      }

      if (f.constraints.filter(c=>c.lastModifiedBy.equals(de.identifier)).length == 0) continue;

      if (f.inheritedFrom) {
        var hierarchialDepth = de.hierarchy.indexOf(f.inheritedFrom.fqn);
        if (hierarchialDepth == -1) hierarchialDepth = (de.hierarchy) ? de.hierarchy.length : 0;
      }

      const findOrCreateTermDefByIdentifier = (identifier) => {
        var termDef = this.termDefinitions.id.find(td => td.name == identifier.name);
        if (!termDef) {
          const numbering = this.termDefinitions.id.map(td => td.nodeId).slice(-1)[0].slice(-1)[0] + 1;
          var desc = '-';
          if (identifier.namespace != 'primitive') {
            desc = this.specs.dataElements.findByIdentifier(identifier).description;
          }
          termDef = new TermDefinition(identifier.name, desc, [...Array(hierarchialDepth).fill(0), numbering], 'id', f);
          if (!this.termDefinitions.id) this.termDefinitions['id'] = [];
          this.termDefinitions.id.push(termDef);
        }
        return termDef;
      };
      var termDefField = this.fields.find(f => f.identifier.name == de.identifier.name);
      if (!termDefField) {
        termDefField = new ADLField(f);
        this.fields.push(f);
      }
      var cstBase = termConstraints.find(tc => tc.constrainedTerm == termDefField && tc instanceof TermConstraintBase);
      if (!cstBase) cstBase = new TermConstraintBase(termDefField);


      //Construct Binding and Existance constraints
      for (const c of f.constraintsFilter.card.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          cstBase.existence = new ADLCardConstraint(cstBase, c.card);

          const valueCimpl = this.specs.dataElements.findByIdentifier(f.identifier).value;
          if (!valueCimpl || !valueCimpl.identifier) continue; //come back here to fix choice values

          const valueTermDef = findOrCreateTermDefByIdentifier(valueCimpl.identifier);

          cstBase.subConstraints.push(new ADLCardConstraint(valueTermDef, c.card));
        }
      }

      //Construct Type Constraints
      for (const c of f.constraintsFilter.type.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          cstBase.subConstraints.push(new ADLTypeConstraint(termDefField, findOrCreateTermDefByIdentifier(c.isA)));
        }
      }

      //Construct VS Constraints
      for (const c of f.constraintsFilter.valueSet.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          const acDef = this.termDefinitions.ac.find(ac => ac.name == c.valueSet);
          if (acDef) cstBase.subConstraints.push(new ADLVSConstraint(termDefField, this.termDefinitions.ac.find(ac => ac.name == c.valueSet)));
        }
      }

      //Construct Code Constraints
      for (const c of f.constraintsFilter.code.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          const valueCimpl = this.specs.dataElements.findByIdentifier(f.identifier).value;
          const valueTermDef = findOrCreateTermDefByIdentifier(valueCimpl.identifier);
          const atTermDef = this.termDefinitions.at.find(atd => atd.name == c.code.code);

          cstBase.subConstraints.push(new ADLCodeConstraint(valueTermDef, atTermDef));
        }
      }

      // //Construct VS Constraints
      // for (const c of f.constraintsFilter.valueSet.constraints) {
      //   if (c.lastModifiedBy.equals(de.identifier)) {
      //     return f;
      //   }
      // }
      termConstraints.push(cstBase);
    }
    this.termConstraints = termConstraints;
    //Construct

    // const fieldsWithCodes = this.combinedFieldsAndValue.filter(f => f.constraintsFilter.hasConstraints);
    // var numbering = 1;
    // for (const f of fieldsWithCodes) {
    //   for (const c of f.constraints) {
    //   }
    // }
  }
}

class TermDefinition {
  constructor(name, description, nodeId, type, sourceCimpl) {
    this._nodeId = nodeId;
    this._name = name;
    this._description = description;
    this._type = type;
    this._sourceCimpl = sourceCimpl;
  }
  get name() { return this._name; }
  get description() { return this._description; }
  get nodeId() { return this._nodeId; }
  get type() { return this._type; }
  get sourceCimpl() { return this._sourceCimpl; }

  isSourceDef() {
    return this.sourceCimpl.constructor.name == 'DataElement';
  }
}

class TermBinding {
  constructor(codesystem, binding, nodeId, type) {
    this._codesystem = codesystem;
    this._nodeId = nodeId;
    this._binding = binding;
    this._type = type;
  }
  get codesystem() { return this._codesystem; }
  get nodeId() { return this._nodeId; }
  get binding() { return this._binding; }
  get type() { return this._type; }
}

class ADLField {
  constructor(sourceCimpl) {
    this.identifier = sourceCimpl.identifier;
    this.sourceCimpl = sourceCimpl;
    this.termDefs = [];
  }
}

class AbstractADLConstraint {
  constructor(constrainedTerm, constraintDef) {
    this._constrainedTerm = constrainedTerm;
    this._constraintDef = constraintDef;
    this.subConstraints = [];
  }

  get constrainedTerm() { return this._constrainedTerm ; }
  set constrainedTerm(constrainedTerm) { this._constrainedTerm = constrainedTerm; }

  get constraintDef() { return this._constraintDef ; }
  set constraintDef(constraintDef) { this._constraintDef = constraintDef; }

  addSubConstraints(subC) { this.subConstraints.push(subC); }
}

class TermConstraintBase extends AbstractADLConstraint {
  constructor(constrainedField) {
    super(constrainedField, null);
  }

  get existence() { return this._existence; }
  set existence(existence) { this._existence = existence; }

  toString() {
    return `${this.constrainedTerm.name}`;
  }
}

class ADLTypeConstraint extends AbstractADLConstraint {
  constructor(constrainedField, constraintDef) {
    super(constrainedField, constraintDef);
  }

  toString() {
    return `${this.constraintDef.name}${formatId(this.constraintDef.nodeId, this.constraintDef.type)}`;
  }
}

class ADLCardConstraint extends AbstractADLConstraint {
  constructor(constrainedTerm, card) {
    super(constrainedTerm);
    this.card = card;
  }

  toString() {
    return `${this.constrainedTerm.name}${formatId(this.constrainedTerm.nodeId, this.constrainedTerm.type)} matches {${this.card.toString()}}`;
  }
}

class ADLCodeConstraint extends AbstractADLConstraint {
  constructor(constrainedTerm, code) {
    super(constrainedTerm);
    this.code = code;
  }

  toString() {
    return `${this.constrainedTerm.name} = <[${this.code.sourceCimpl.code.system}::${this.code.sourceCimpl.code.code}]>`;
  }
}

class ADLVSConstraint extends AbstractADLConstraint {
  constructor(constrainedField, constraintDef) {
    super(constrainedField, constraintDef);
  }
  toString() {
    return `/${this.constrainedTerm.identifier.name} matches {${formatId(this.constraintDef.nodeId, this.constraintDef.type)}}`;
  }
}

// class ADLRefConstraint  extends AbstractADLConstraint {
//   constructor(constrainedTerm, constraintDef) {
//     super(constrainedTerm, constraintDef);
//   }
//   toString() {
//     // return `${this.constraintDef.name}${formatId(this.constraintDef.nodeId)}`;
//   }
// }

// class ADLCodeConstraint {}
// class ADLIncludesTypeConstraint {}
// class ADLIncludesCodeConstraint {}
// class ADLBooleanConstraint {}


class DataElementADLFormatter {
  constructor(specs, config) {
    this._specs = specs;
    this._config =  config;
  }

  get specs() { return this._specs; }
  get config() { return this._config; }

  format(adlElement) {
    const parts = [];

    const header = this.formatHeader(adlElement);
    parts.push(header);

    if (adlElement.dataElement.basedOn.length > 0) {
      const basedOn = this.formatBasedOn(adlElement);
      parts.push(basedOn);
    }

    const metaData = this.formatMetaData(adlElement);
    parts.push(metaData);

    const constraintsOnFields = this.formatConstraintsOnFields(adlElement);
    parts.push(constraintsOnFields);

    const termParts = [];
    if (Object.keys(adlElement.termDefinitions).length > 0) {
      const termDefinitions = this.formatTermDefinitions(adlElement);
      termParts.push(termDefinitions);
    }

    if (adlElement.termBindings.length > 0) {
      const termBindings = this.formatTermBindings(adlElement);
      termParts.push(termBindings);
    }

    if (termParts.length > 0) {
      parts.push(['terminology', ...termParts].join('\n'));
    }

    return parts.join('\n\n').replace(/\t/g,' '.repeat(TAB_SIZE));
  }

  formatHeader(el) {
    const header =
      [`archetype (adl_version=2.3; rm_release=0.0.1)`,
        `\tSHR-CORE-${this.reformatNamespace(el.namespace)}.${el.name}.v0.0.1`
      ].join('\n');

    return header;
  }

  formatBasedOn(el) {
    const basedOnNS = el.dataElement.basedOn[0].namespace;
    const basedOnName = el.dataElement.basedOn[0].name;
    const basedOn =
      [`specialize`,
        `\tSHR-CORE-${this.reformatNamespace(basedOnNS)}.${basedOnName}.v0.0.1`
      ].join('\n');

    return basedOn;
  }

  formatMetaData(el) {
    const language = [
      `language`,
      `\toriginal_language = <[ISO_639-1::en]>`
    ].join('\n');

    const formatOriginalAuthor = () => {
      const date = new Date(Date.now()).toLocaleDateString();
      return [
        `\toriginal_author = <`,
        `\t\t["name"] = <"${this.config.provinenceInfo.leadAuthor.name}">`,
        `\t\t["organisation"] = <"${this.config.provinenceInfo.leadAuthor.organization}">`,
        `\t\t["email"] = <"${this.config.provinenceInfo.leadAuthor.email}">`,
        `\t\t["date"] = <"${date}">`,
        `\t>`
      ].join('\n');
    };

    const formatDetails = () => {
      return [
        `\tdetails = <`,
        `\t\t["en"] = <`,
        `\t\t\tlanguage = <[ISO_639-1::en]>`,
        `\t\t\tpurpose = <"${this.specs.namespaces.find(el.namespace).description}">`,
        `\t\t\tuse = <"${this.specs.namespaces.find(el.namespace).description}">`,
        `\t\t\tkeywords = <"${el.namespace.toLowerCase()}","${el.name.split(/(?=[A-Z])/).join(' ').toLowerCase()}">`,
        `\t\t>`,
        `\t>`
      ].join('\n');
    };

    const formatAdditionalInformation = () => {
      const additionalInformation = [
        `\tlifecycle_state = <"initial">`
      ];
      if (this.config.provinenceInfo.otherAuthors) {
        additionalInformation.push(`\tother_contributors = <"${this.config.provinenceInfo.otherAuthors.map(a => `${a.name} <${a.email}>`).join(', ')}">`);
      }
      if (this.config.publisher) {
        additionalInformation.push(`\tcustodian_organisation = <"${this.config.publisher}">`);
      }
      additionalInformation.push(`\tlicence = <"Creative Commons CC-BY <https://creativecommons.org/licenses/by/3.0/>">`);
      if (this.config.provinenceInfo.copyright) {
        additionalInformation.push(`\tcopyright = <"${this.config.provinenceInfo.copyright}">`);
      }
      if (this.config.provinenceInfo.ipAcknowledgements) {
        additionalInformation.push(`\tip_acknowledgements = <>`);
      }

      return additionalInformation.join('\n');
    };


    const description = [
      `description`,
      formatOriginalAuthor(),
      formatDetails(),
      formatAdditionalInformation()
    ].join('\n');

    return [
      language,
      description,
    ].join('\n\n');
  }

  formatTermDefinitions(el) {
    const formatDefinition = (term) => {
      return [
        `${formatId(term.nodeId, term.type)} = <`,
        `\ttext = <"${term.name}">`,
        `\tdescription = <"${(term.description) ? term.description : '-'}">`.split('\n').join(`\n\t\t\t${' '.repeat(16)}`),
        `>`
      ];
    };

    const formatIdTerms = () => {
      const formattedTerms = [];
      if ('id' in el.termDefinitions) {
        const terms = el.termDefinitions['id'];
        for (const term of terms) {
          formattedTerms.push(...formatDefinition(term));
        }
      }
      return formattedTerms;
    };

    const formatAcTerms = () => {
      const formattedTerms = [];
      if ('ac' in el.termDefinitions) {
        const terms = el.termDefinitions['ac'];
        for (const term of terms) {
          formattedTerms.push(...formatDefinition(term));
        }
      }
      return formattedTerms;
    };

    const formatAtTerms = () => {
      const formattedTerms = [];
      if ('at' in el.termDefinitions) {
        const terms = el.termDefinitions['at'];
        for (const term of terms) {
          formattedTerms.push(...formatDefinition(term));
        }
      }
      return formattedTerms;
    };

    return [
      `\tterm_definitions = <`,
      `\t["en"] = <`,
      ...formatIdTerms().map(t => `\t\t${t}`),
      ...formatAcTerms().map(t => `\t\t${t}`),
      ...formatAtTerms().map(t => `\t\t${t}`),
      `\t>`,
      `>`
    ].join('\n\t');
  }

  formatTermBindings(el) {
    const formatBinding = (term) => {
      return `${formatId(term.nodeId, term.type)} = <${term.binding}>`;
    };

    const bindingsBySrc = () => {
      const formattedBySrc = [];

      const sortedBySrc = el.termBindings.reduce((out, b) => {
        if (!out[b.codesystem]) out[b.codesystem] = [];
        out[b.codesystem].push(b);
        return out;
      }, {});

      for (const src in sortedBySrc) {
        const formattedSrc = [
          `\t["snomed-ct"] = <`,
          `\t\titems = <`,
          ...sortedBySrc[src].map(b => `\t\t${formatBinding(b)}`),
          `\t\t>`,
          `\t>`
        ];
        formattedBySrc.push(...formattedSrc);
      }
      return formattedBySrc;
    };

    return [
      `\tterm_bindings = <`,
      ...bindingsBySrc().map(b => `${b}`),
      `>`
    ].join('\n\t');
  }


  formatConstraintsOnFields(el) {
    const formatMatchStatement = (left, right) => {
      return [
        `${left} matches {`,
        `\t${right}`,
        `}`
      ];
    };

    const formatSubConstraints = (subCs) => {
      const substrings = [];

      //first do type and card
      for (const c of subCs) {
        if (c.constructor.name == 'ADLTypeConstraint') {
          substrings.push(c.toString());
        }
        if (c.constructor.name == 'ADLCardConstraint') {
          if (subCs.find(subc => subc.constructor.name == 'ADLTypeConstraints')) {
            continue;
          }
          substrings.push(c.toString());
        } else if (c.constructor.name == 'ADLVSConstraint') {
          substrings.push(c.toString());
        } else if (c.constructor.name == 'ADLCodeConstraint') {
          substrings.push(c.toString());
        }
      }

      return substrings;
    };


    const declarativeConstraintTerm = el.termDefinitions.id.find(e => e.sourceCimpl.constructor.name == 'DataElement');
    const formattedDeclaration = `${declarativeConstraintTerm.name}${formatId(declarativeConstraintTerm.nodeId, declarativeConstraintTerm.type)} matches {`;

    const formattedConstraints = [];

    for (const c of el.termConstraints) {
      const name = (c.constrainedTerm.constructor.name == 'ADLField') ?  c.constrainedTerm.identifier.name : c.constrainedTerm.name;
      const outsideMatchText = `${[makeCamlCased(name)]}${(c.existence) ? ` existence matches {${c.existence.card.toString()}}` : ''}`;
      const insideMatchText = formatSubConstraints(c.subConstraints);
      if (insideMatchText.join('').length == 0) {
        continue;
      }
      formattedConstraints.push(...formatMatchStatement(outsideMatchText, insideMatchText).indentStrings());
      // c.constraintDef.identifier.name,
      // formatId(c.constrainedTerm.nodeId, c.constrainedTerm.type)
    }
    return [
      'definition',
      `\t${formattedDeclaration}`,
      `${formattedConstraints.indentStrings().join('\n')}`,
      '\t}'
    ].join('\n');
  }



  reformatNamespace(ns) {
    return ns.split('.').map(partial=>partial.charAt(0).toUpperCase() + partial.slice(1)).join('');
  }

}




module.exports = { exportToADL, exportToBMM, setLogger };