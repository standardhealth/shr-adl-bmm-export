const bunyan = require('bunyan');
const fs = require('fs')
const path = require('path');

var rootLogger = bunyan.createLogger({name: 'shr-adl-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

function exportToADL(specs, config) {
  const exporter = new ADLExporter(specs, config);
  return exporter.export();
}

class ADLExporter {
    constructor(specs, config) {
        this._specs = specs;
        this._config =  config;
    }

    get specs() { return this._specs; }
    get config() { return this._config; }


  export() {
    const formatter = new DataElementADLFormatter(this.specs, this.config);

    const entries = this.specs.dataElements.entries;
    for (const de of entries) {
      formatter.format(de)
    }
  }


}

class DataElementADLFormatter {
  constructor(specs, config) {
    this._specs = specs;
    this._config =  config;
  }

  get specs() { return this._specs; }
  get config() { return this._config; }

  format(dataElement) {
    const header = this.formatHeader(dataElement);
    const basedOn = this.formatBasedOn(dataElement);
    const metaData = this.formatMetaData(dataElement);
    // const constraintsOnFields = this.formatConstraintsOnFields(dataElement);

    const termDefinitions = this.formatTermDefinitions(dataElement);

    return [
      header,
      basedOn,
      metaData,
      // constraintsOnFields
    ].join('\n\n');
  }

  formatHeader(de) {
    const header =
      [`archetype (adl_version=2.0.6; rm_release=0.0.1)`,
       `CIMI-CORE-${de.identifier.namespace}.${de.identifier.name}.v1.0.0`
    ].join('\n');

    return header;
  }

  formatBasedOn(de) {
    const basedOnNS = de.basedOn[0].namespace;
    const basedOnName = de.basedOn[0].name;
    const basedOn =
      [`specialize`,
       `CIMI-CORE-${basedOnNS}.${basedOnName}.v1`
      ].join('\n');

    return basedOn;
  }

  formatMetaData(de) {
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
    }

    const details = [
        `\tdetails = <`,
        `\t\t["en"] = <`,
        `\t\t\tlanguage = <[ISO_639-1::en]>`,
        `\t\t\tpurpose = <"${this.specs.namespaces[de.namespace]}">`,
        `\t\t\tuse = <"${this.specs.namespaces[de.namespace]}">`,
        `\t\t\tkeywords = <"${de.identifier.namespace.toLowerCase()}","${de.identifier.name.split(/(?=[A-Z])/).join(" ").toLowerCase()}">`,
        `\t\t>`,
        `\t>`
      ].join('\n');

    const additionalInformation = [
      `\tlifecycle_state = <"managed">`,
      `\tother_contributors = <"${this.config.provinenceInfo.otherAuthors.map(a => `${a.name} <${a.email}>`).join(', ')}">`,
      `\tcustodian_organisation = <"${this.config.publisher}">`,
      `\tlicence = <"Creative Commons CC-BY <https://creativecommons.org/licenses/by/3.0/>">`,
      `\tcopyright = <"${this.config.provinenceInfo.copyright}">`,
      `\tip_acknowledgements = <>`
    ].join('\n');


    return [
      language,
      `description`,
      formatOriginalAuthor(),
      details,
      additionalInformation
    ].join('\n\n');
  }

  formatConstraintsOnFields(de) {
    return;
  }

  formatCardConstraint(de) {
    return;
  }

  formatTermDefinitions(de) {
    const formatDefinition = (name, description, id) => {
      return [
        `["${id}"] = <`,
        `\ttext = <"${name}">`,
        `\tdescription = <"${description}">`,
        `>`
      ].join('\n');
    }

    const formatID = (ids) => {
      return `id["${ids.join('.')}"]`;
    }

    const idDefintions = () => {
      const combinedFieldsAndValue = [];
      if (de.fields) combinedFieldsAndValue.push(...de.fields);
      if (de.value) combinedFieldsAndValue.push(de.value);

      const hierarchialDepth = (de.hierarchy) ? de.hierarchy.length + 1 : 1;
      const elementDeclarationDef = formatDefinition(de.identifier.name, de.description, formatID(Array(hierarchialDepth).fill(1)))

      const fieldDefs = [];
      const newFieldDefs = combinedFieldsAndValue.filter(f => !f.inheritance && f.identifier);
      for (let i = 1; i <= newFieldDefs.length; i++) {
        const f = newFieldDefs[i-1];

        const fieldElementDefinition = this.specs.dataElements.findByIdentifier(f.identifier);
        const formattedFieldDef = formatDefinition(fieldElementDefinition.identifier.name, fieldElementDefinition.description, formatID([...Array(hierarchialDepth - 1).fill(0), i]));
        fieldDefs.push(formattedFieldDef);
      }

      return [elementDeclarationDef, ...fieldDefs].map(d => `\t${d}`).join('\n');
    }

    return [
      `term_definitions = <`,
      `\t["en"] = <`,
      idDefintions(),
      `\t>`
      `>`
    ];
  }
}



// function exportToADL() {
//   const filePath = '../../shr-cli/out/specs';
//   const files = fs.readdirSync(filePath);


//   for (const subdir of files) {
//     const subPath = path.join(src, subdir);

//     if (!fs.lstatSync(subPath).isDirectory()) return;

//     fs.readdirSync(subPath).forEach((item) => {
//       console.log(item)
//     });
//       //console.log(files);
// }

// if (require.main === module) {
//   console.log('exporting')
//   exportToADL();
// }













module.exports = { exportToADL, setLogger }
