const { DataElementADLFormatter } = require('./adl-formatter');
// const fs = require('fs');
// const path = require('path');
const bunyan = require('bunyan');

var rootLogger = bunyan.createLogger({name: 'shr-adl-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

function exportToADL(specs, config) {
  const exporter = new ADLExporter(specs, config);
  return exporter.export();
}

Array.prototype.indentStrings = function indentStrings() {
  return this.map(i => (i.constructor.name == 'String') ? `\t${i}` : i);
};

const formatId = (idArray, type, quotes=false) => {
  let idString = `${type}${idArray.join('.')}`;
  if (quotes) {
    idString = `"${idString}"`;
  }
  return `[${idString}]`;
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
    const adlSpecs = [];
    for (const de of [...entries, ...parents]) {
      if (!adlSpecs.find(el => el.dataElement.identifier.equals(de.identifier))) {
        const adlEl = new AdlElement(de, this.specs, adlSpecs, this.config);
        adlSpecs.push(adlEl);
      }
    }

    const formattedFiles = {};
    adlSpecs.forEach(adlEl => formattedFiles[adlEl.name] = formatter.format(adlEl));

    return formattedFiles;
  }
}

/*
//   /$$$$$$                                  /$$                                     /$$
//  /$$__  $$                                | $$                                    | $$
// | $$  \__/  /$$$$$$  /$$$$$$$   /$$$$$$$ /$$$$$$    /$$$$$$  /$$   /$$  /$$$$$$$ /$$$$$$    /$$$$$$   /$$$$$$
// | $$       /$$__  $$| $$__  $$ /$$_____/|_  $$_/   /$$__  $$| $$  | $$ /$$_____/|_  $$_/   /$$__  $$ /$$__  $$
// | $$      | $$  \ $$| $$  \ $$|  $$$$$$   | $$    | $$  \__/| $$  | $$| $$        | $$    | $$  \ $$| $$  \__/
// | $$    $$| $$  | $$| $$  | $$ \____  $$  | $$ /$$| $$      | $$  | $$| $$        | $$ /$$| $$  | $$| $$
// |  $$$$$$/|  $$$$$$/| $$  | $$ /$$$$$$$/  |  $$$$/| $$      |  $$$$$$/|  $$$$$$$  |  $$$$/|  $$$$$$/| $$
//  \______/  \______/ |__/  |__/|_______/    \___/  |__/       \______/  \_______/   \___/   \______/ |__/
*/


class AdlElement {
  constructor(dataElement, specs, adlSpecs, config) {
    this._specs = specs;
    this._config = config;
    this._dataElement = dataElement;
    this.adlSpecs = adlSpecs;

    //this._archetype;
    //this._language;
    this.termConstraints = [];
    this.termDefinitions = {};
    this.termBindings = [];
    this.fields = [];

    this.name = dataElement.identifier.name;
    this.namespace = dataElement.identifier.namespace;
    this.description = dataElement.description;
    this.parent = this.findParent();
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

  findParent() {
    if (this.dataElement.basedOn.length == 0) {
      return;
    } else {
      const parentId = this.dataElement.basedOn[0];
      let parentAdl = this.adlSpecs.find(adlEl => adlEl.dataElement.identifier.equals(parentId));
      if (parentAdl) {
        return parentAdl;
      } else {
        const parentDE = this.specs.dataElements.findByIdentifier(parentId);
        parentAdl = new AdlElement(parentDE, this.specs, this.adlSpecs, this.config);
        this.adlSpecs.push(parentAdl);
        return parentAdl;
      }
    }
  }

  construct(dataElement) {
    this.constructTermDefinitions(dataElement);
    // this.constructTermBindings(dataElement);
    this.constructConstraintDefinitions(dataElement);
  }


  constructTermDefinitions(de) {
    const idDefs = this.constructIdTermDefs(de);
    if (idDefs) this.termDefinitions['id'] = idDefs;

    // const acDefs = this.constructAcTermDefs(de);
    // if (acDefs) this.termDefinitions['ac'] = acDefs;

    const atDefs = this.constructAtTermDefs(de);
    if (atDefs) this.termDefinitions['at'] = atDefs;
  }

  constructIdTermDefs(de) {
    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;
    const elementDeclarationDef = new TermDefinition(de.identifier.name, de.description, Array(hierarchialDepth).fill(1), 'id', de);

    const idDefs = [elementDeclarationDef];
    let numbering = 2;

    //Construct IdTerm for new Values
    const newValueDef = this.dataElement.value;
    if (newValueDef && !newValueDef.inheritance && newValueDef.identifier) {
      const valueDE = this.specs.dataElements.findByIdentifier(newValueDef.identifier);
      const adlField = new ADLField(valueDE, true);
      const atFieldDef = new TermDefinition(valueDE.identifier.name, valueDE.description, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'id', newValueDef);

      this.fields.push(adlField);
      idDefs.push(atFieldDef);
    }

    //Construct IdTerms for new Fields
    const newFieldDefs = this.dataElement.fields.filter(f => !f.inheritance && f.identifier);
    if (newFieldDefs.length > 0) {
      for (const f of newFieldDefs) {
        const fieldDE = this.specs.dataElements.findByIdentifier(f.identifier);
        const adlField = new ADLField(fieldDE);
        const atFieldDef = new TermDefinition(fieldDE.identifier.name, fieldDE.description, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'id', f);

        this.fields.push(adlField);
        idDefs.push(atFieldDef);
      }
    }

    if (this.parent) {
      for (const parentId of this.parent.termDefinitions.id) {
        const cloneId = parentId.clone();
        cloneId.isInherited = true;
        idDefs.push(cloneId);
      }
    }


    return idDefs;
  }

  //Local Value Sets [ac = archetype constraints]
  constructAcTermDefs(de) {
    const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;

    const acDefs = [];
    const fieldsWithVS = this.combinedFieldsAndValue.filter(f => f.constraintsFilter.valueSet.hasConstraints);
    let numbering = 2;
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
    let numbering = 2;
    for (const f of fieldsWithCodes) {
      for (const c of f.constraints) {
        if (c.constructor.name == 'TypeConstraint') {
          if (c.code) {
            const code = c.code;
            if (c.lastModifiedBy.equals(de.identifier) && !atDefs.find(d => d.name == code.code)) {
              const atDef = new TermDefinition(code.code, code.display, [...Array(hierarchialDepth - 1).fill(0), numbering++], 'at', c);
              atDefs.push(atDef);
            }
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
    let numbering = 2;
    for (const f of fieldsWithConstraints) {
      for (const c of f.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          if (c.constructor.name == 'ValueSetConstraint') {
            // const termDef = this.termDefinitions.id
            let binding = new TermBinding(c.valueSet.match(/(\w*)\.\w*/)[1], c.valueSet, this.termDefinitions.id.find(td=>td.name == f.identifier.name).node, 'id');
            bindings.push(binding);
          } else if (c.constructor.name == 'CodeConstraint') {
            let binding = new TermBinding(c.code.system.match(/(\w*)\.\w*/)[1], `${c.code.system}/${c.code.code}`, this.termDefinitions.id.find(td=>td.name == f.identifier.name).node, 'id');
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
      for (const def of this.termDefinitions.id.filter(td=>!td.isInherited)) {
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

      let hierarchialDepth = 0;
      if (de.hierarchy) {
        hierarchialDepth = de.hierarchy.length;
      }

      const findOrCreateTermDefByIdentifier = (identifier) => {
        let termDef = this.termDefinitions.id.find(td => td.name == identifier.name);
        if (!termDef || termDef.isSourceDef()) {
          const numbering = this.termDefinitions.id.filter(td=>!td.isInherited).map(td => td.nodeId).slice(-1)[0].slice(-1)[0] + 2;
          let desc = '-';
          let idName;

          if (identifier.namespace != 'primitive') {
            if (this.specs.dataElements.findByIdentifier(identifier)) {
              desc = this.specs.dataElements.findByIdentifier(identifier).description;
            }
            idName = identifier.name;
          } else {
            idName = identifier.name.toUpperCase();
          }

          termDef = new TermDefinition(idName, desc, [...Array(hierarchialDepth).fill(0), numbering], 'id', f);
          if (!this.termDefinitions.id) this.termDefinitions['id'] = [];
          this.termDefinitions.id.push(termDef);
        }
        return termDef;
      };

      let termDefField = this.fields.find(termDefField => f.identifier.name == termDefField.identifier.name);
      if (!termDefField) {
        termDefField = new ADLField(f);
        this.fields.push(f);
      }
      let cstBase = termConstraints.find(tc => tc.constrainedTerm == termDefField && tc instanceof TermConstraintBase);
      if (!cstBase) {
        cstBase = new TermConstraintBase(termDefField);
        termConstraints.push(cstBase);
      }


      //Construct Cardinality and Existance constraints
      // for (const c of f.constraintsFilter.card.constraints) {
      //   if (c.lastModifiedBy.equals(de.identifier)) {
      //     cstBase.existence = new ADLCardConstraint(cstBase, c.card);

      //     const valueCimpl = this.specs.dataElements.findByIdentifier(f.identifier).value;
      //     if (!valueCimpl || !valueCimpl.identifier) continue; //come back here to fix choice values

      //     const valueTermDef = findOrCreateTermDefByIdentifier(valueCimpl.identifier);

      //     cstBase.subConstraints.push(new ADLCardConstraint(valueTermDef, c.card));
      //   }
      // }

      // Construct Type Constraints
      const fieldOrigDef = this.specs.dataElements.findByIdentifier(f.identifier);

      for (const c of f.constraintsFilter.type.constraints) {
        if (c.lastModifiedBy.equals(de.identifier)) {
          let onValue = c.onValue;
          if (c.path && c.path.length > 0 && fieldOrigDef.value && fieldOrigDef.value.identifier.fqn == c.path[0].fqn) {
            onValue = true;
          }
          cstBase.subConstraints.push(new ADLTypeConstraint(termDefField, findOrCreateTermDefByIdentifier(c.isA), onValue, c.path, c));
        }
      }

      // Construct VS Constraints
      // for (const c of f.constraintsFilter.valueSet.constraints) {
      //   if (c.lastModifiedBy.equals(de.identifier)) {
      //     const acDef = this.termDefinitions.ac.find(ac => ac.name == c.valueSet);
      //     const isChoice = f.constructor.name == 'ChoiceValue';
      //     if (acDef) cstBase.subConstraints.push(new ADLVSConstraint(termDefField, this.termDefinitions.ac.find(ac => ac.name == c.valueSet), isChoice));
      //   }
      // }

      // //Construct Code Constraints
      // for (const c of f.constraintsFilter.code.constraints) {
      //   if (c.lastModifiedBy.equals(de.identifier)) {
      //     const valueCimpl = this.specs.dataElements.findByIdentifier(f.identifier).value;
      //     const valueTermDef = findOrCreateTermDefByIdentifier(valueCimpl.identifier);
      //     const atTermDef = this.termDefinitions.at.find(atd => atd.name == c.code.code);

      //     cstBase.subConstraints.push(new ADLCodeConstraint(valueTermDef, atTermDef));
      //   }
      // }

      // //Construct VS Constraints
      // for (const c of f.constraintsFilter.valueSet.constraints) {
      //   if (c.lastModifiedBy.equals(de.identifier)) {
      //     return f;
      //   }
      // }
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
  constructor(name, description, nodeId, type, sourceCimpl, isInherited=false) {
    this._nodeId = nodeId;
    this._name = name;
    this._description = description;
    this._type = type;
    this._sourceCimpl = sourceCimpl;
    this.isInherited = isInherited;
    this.node = new Node(name, nodeId);
  }
  get name() { return this._name; }
  get description() { return this._description; }
  get nodeId() { return this._nodeId; }
  get type() { return this._type; }
  get sourceCimpl() { return this._sourceCimpl; }

  isSourceDef() {
    return this.sourceCimpl.constructor.name == 'DataElement';
  }

  clone() {
    return new TermDefinition(this.name, this.description, this.nodeId, this.type, this.sourceCimpl, this.isInherited);
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
  constructor(sourceCimpl, isValue=false) {
    this.identifier = sourceCimpl.identifier;
    this.sourceCimpl = sourceCimpl;
    this.termDefs = [];
    this.isValue = isValue;
  }
}

class AbstractADLConstraint {
  constructor(constrainedTerm, constraintDef, path, sourceCimpl) {
    this._constrainedTerm = constrainedTerm;
    this._constraintDef = constraintDef;
    this.path = path;
    this.subConstraints = [];
    this.sourceCimpl = sourceCimpl;
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
  constructor(constrainedField, constraintDef, onValue, path, sourceCimpl) {
    super(constrainedField, constraintDef, path, sourceCimpl);
    this.onValue = onValue;
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
  constructor(constrainedField, constraintDef, isChoice=false) {
    super(constrainedField, constraintDef);
    this.isChoice = isChoice;
  }
  toString() {
    return `/value${this.isChoice ? 'ChoiceCodeableConcept' : ''} matches {${formatId(this.constraintDef.nodeId, this.constraintDef.type)}}`;
  }
}

class Node {
  constructor(name, id, hierarchy) {
    this.name = name;
    this.id = id;
    this.hierarchy = hierarchy;
  }

  toString() {
    return `/${this.hierarchy.map(node => `${node.name}[${formatId(node.id, type)}]`).join('/')}`;
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






module.exports = { exportToADL, setLogger };