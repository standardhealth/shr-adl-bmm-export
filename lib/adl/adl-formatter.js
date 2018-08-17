/*
//  /$$$$$$$$                                               /$$       /$$
// | $$_____/                                              | $$      | $$
// | $$        /$$$$$$   /$$$$$$  /$$$$$$/$$$$   /$$$$$$  /$$$$$$   /$$$$$$    /$$$$$$   /$$$$$$
// | $$$$$    /$$__  $$ /$$__  $$| $$_  $$_  $$ |____  $$|_  $$_/  |_  $$_/   /$$__  $$ /$$__  $$
// | $$__/   | $$  \ $$| $$  \__/| $$ \ $$ \ $$  /$$$$$$$  | $$      | $$    | $$$$$$$$| $$  \__/
// | $$      | $$  | $$| $$      | $$ | $$ | $$ /$$__  $$  | $$ /$$  | $$ /$$| $$_____/| $$
// | $$      |  $$$$$$/| $$      | $$ | $$ | $$|  $$$$$$$  |  $$$$/  |  $$$$/|  $$$$$$$| $$
// |__/       \______/ |__/      |__/ |__/ |__/ \_______/   \___/     \___/   \_______/|__/
*/

const makeCamlCased = (string) => {
  return string.charAt(0).toLowerCase() + string.slice(1);
};


const makeUnderscoreSeparated = (string) => {
  return string.split(/(?=[A-Z])/).join('_').toLowerCase();
};
const TAB_SIZE = 2;

Array.prototype.indentStrings = function indentStrings() {
  return this.map(i => (i.constructor.name == 'String') ? `\t${i}` : i);
};

const formatId = (idArray, type, quotes = false) => {
  let idString = `${type}${idArray.join('.')}`;
  if (quotes) {
    idString = `"${idString}"`;
  }
  return `[${idString}]`;
};


class DataElementADLFormatter {
  constructor(specs, config) {
    this._specs = specs;
    this._config = config;
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

    return parts.join('\n\n').replace(/\t/g, ' '.repeat(TAB_SIZE));
  }

  formatHeader(el) {
    const header =
            [`archetype (adl_version=2.3; rm_release=0.0.1)`,
              `\tSHR-CORE-${el.name}.${makeUnderscoreSeparated(el.name)}.v0.0.1`
            ].join('\n');

    return header;
  }

  formatBasedOn(el) {
    // const basedOnNS = el.dataElement.basedOn[0].namespace;
    const basedOnName = el.dataElement.basedOn[0].name;
    const basedOn =
            [`specialize`,
              `\tSHR-CORE-${basedOnName}.${makeUnderscoreSeparated(basedOnName)}.v0.0.1`
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
        `\t\t["name"] = <"${this.config.provinanceInfo.leadAuthor.name}">`,
        `\t\t["organisation"] = <"${this.config.provinanceInfo.leadAuthor.organization}">`,
        `\t\t["email"] = <"${this.config.provinanceInfo.leadAuthor.email}">`,
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
      if (this.config.provinanceInfo.otherAuthors) {
        additionalInformation.push(`\tother_contributors = <"${this.config.provinanceInfo.otherAuthors.map(a => `${a.name} <${a.email}>`).join(', ')}">`);
      }
      if (this.config.publisher) {
        additionalInformation.push(`\tcustodian_organisation = <"${this.config.publisher}">`);
      }
      additionalInformation.push(`\tlicence = <"Creative Commons CC-BY <https://creativecommons.org/licenses/by/3.0/>">`);
      if (this.config.provinanceInfo.copyright) {
        additionalInformation.push(`\tcopyright = <"${this.config.provinanceInfo.copyright}">`);
      }
      if (this.config.provinanceInfo.ipAcknowledgements) {
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
        `${formatId(term.nodeId, term.type, true)} = <`,
        `\ttext = <"${term.name.replace(/-/,'')}">`,
        `\tdescription = <"${(term.description) ? term.description : '-'}">`.split('\n').join(`\n\t\t\t${' '.repeat(16)}`),
        `>`
      ];
    };

    const formatIdTerms = () => {
      const formattedTerms = [];
      if ('id' in el.termDefinitions) {
        const terms = el.termDefinitions['id'].filter(id => !id.isInherited);
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
      return `${formatId(term.nodeId, term.type, true)} = <${term.binding}>`;
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
          `\t["${src}"] = <`,
          `\t\titems = <`,
          ...sortedBySrc[src].map(b => `\t\t\t${formatBinding(b)}`),
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
      if (right) {
        return [
          `${left} matches {`,
          `\t${right}`,
          `}`
        ];
      } else {
        return [
          `${left}`
        ];
      }
    };

    const formatSubConstraints = (subCs) => {
      const substrings = [];

      //first do type
      const typeConstraints = subCs.filter(c=>c.constructor.name == 'ADLTypeConstraint');

      for (const c of typeConstraints) {
        if (c.path && c.path.length > 0) continue;
        if (c.constructor.name == 'ADLTypeConstraint') {
          let cstString = c.toString();
          if (c.onValue) {
            continue;
          } else {
            if (typeConstraints.length > 1 && typeConstraints.some(tc => tc.onValue && tc.path.length == 1)) {
              const valueCst = typeConstraints.find(tc => tc.onValue && tc.path.length == 1);
              const targetIdentifier = valueCst.constrainedTerm.sourceCimpl.identifier;
              const target = this.specs.dataElements.findByIdentifier(targetIdentifier).value;
              let valueCstString;

              if (target.constructor.name === 'ChoiceValue') {
                valueCstString = `valueChoice${valueCst.constraintDef.name} matches { ${valueCst.toString()} }`;
              } else {
                valueCstString = `value matches { ${valueCst.toString()} }`;
              }

              cstString = formatMatchStatement(cstString, valueCstString).join('\n\t');

            }
            substrings.push(cstString);
          }
        }
      }
      // if (c.constructor.name == 'ADLCardConstraint') {
      //   if (subCs.find(subc => subc.constructor.name == 'ADLTypeConstraints')) {
      //     continue;
      //   }
      //   substrings.push(c.toString());
      // } else if (c.constructor.name == 'ADLCodeConstraint') {
      //   substrings.push(c.toString());
      // }
      // }

      return substrings;
    };


    const declarativeConstraintTerm = el.termDefinitions.id.find(e => e.sourceCimpl.constructor.name == 'DataElement');
    const formattedDeclaration = `${declarativeConstraintTerm.name.replace(/-/,'')}${formatId(declarativeConstraintTerm.nodeId, declarativeConstraintTerm.type)}`;

    const formattedConstraints = [];

    for (const c of el.termConstraints) {
      let name;
      if (c.constrainedTerm.constructor.name == 'ADLField') {
        if (c.constrainedTerm.isValue) {
          name = 'value';
        } else {
          name = `${c.constrainedTerm.identifier.name}`.replace(/-/,'');
        }
      } else {
        name = c.constrainedTerm.name;
      }

      let pathCsts = {};
      for (const cst of c.subConstraints) {
        if (cst.path && cst.path.length > 0 && !cst.onValue) {
          if (cst.constructor.name == 'ADLTypeConstraint') {
            if (cst.constrainedTerm.isValue) continue;
            if (!pathCsts[cst.path[0].name]) {
              pathCsts[cst.path[0].name] = [];
            }
            pathCsts[cst.path[0].name].push(cst.toString());
          }
        }
      }
      for (const path in pathCsts) {
        formattedConstraints.push(`\t/${makeCamlCased(name)}/${makeCamlCased(path)} ${pathCsts[path].map(str => `matches { ${str} }`).join(' ')}`);
      }
      // formattedConstraints.push(`//value ${valueCsts.map(str => `matches {${str}}`).join(\' \')}`);');

      let valueCsts = [];
      for (const cst of c.subConstraints) {
        if (cst.constructor.name == 'ADLTypeConstraint') {
          if (cst.onValue) {
            valueCsts.push(cst);
          }
        } else if (cst.constructor.name == 'ADLVSConstraint') {
          valueCsts.push(cst);
        }
      }

      if (valueCsts.length > 0) {
        for (const valueConstraint of valueCsts) {
          if (valueConstraint.path.length == 1 && c.subConstraints.some(cst => !cst.path && cst.constrainedTerm == valueConstraint.constrainedTerm)) { //This is handled in formatSubConstraints
            continue;
          }

          const targetIdentifier = valueConstraint.constrainedTerm.sourceCimpl.identifier;
          const target = this.specs.dataElements.findByIdentifier(targetIdentifier);
          if (target.value) {
            if (target.value.constructor.name === 'ChoiceValue') {
              formattedConstraints.push(`\t/${makeCamlCased(name)}/valueChoice${valueConstraint.constraintDef.name} ${valueCsts.map(v => `matches { ${v.toString()} }`).join(' ')}`);
            } else {
              formattedConstraints.push(`\t/${makeCamlCased(name)}/value ${valueCsts.map(v => `matches { ${v.toString()} }`).join(' ')}`);
            }
          }
        }
      }


      const outsideMatchText = `${[makeCamlCased(name)]}${(c.existence) ? ` existence matches {${c.existence.card.toString()}}` : ''}`;
      const insideMatchText = formatSubConstraints(c.subConstraints);
      if (insideMatchText.join().length == 0) {
        continue;
      }
      formattedConstraints.push(...formatMatchStatement(outsideMatchText, insideMatchText.join('\t\n')).indentStrings());
      // c.constraintDef.identifier.name,
      // formatId(c.constrainedTerm.nodeId, c.constrainedTerm.type)
    }

    if (formattedConstraints.length > 0) {
      return [
        'definition',
        `\t${formattedDeclaration} matches {`,
        `${formattedConstraints.indentStrings().join('\n')}`,
        '\t}'
      ].join('\n');
    } else {
      return [
        'definition',
        `\t${formattedDeclaration}`,
      ].join('\n');
    }
  }



  reformatNamespace(ns) {
    return ns.split('.').map(partial => partial.charAt(0).toUpperCase() + partial.slice(1)).join('');
  }

}

module.exports = { DataElementADLFormatter };