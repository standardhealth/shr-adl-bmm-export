const AdlExporter = require('./adl/adl-export');
const BmmExporter = require('./bmm/bmm-export');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

const bunyan = require('bunyan');

var rootLogger = bunyan.createLogger({name: 'shr-adl-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}


function generateADLtoPath(specs, config, outputPath) {
  //AOM Files
  mkdirp.sync(path.join(outputPath, 'adl-bmm', 'aom'));
  fs.copyFileSync(path.join(__dirname, 'aom', 'shr_aom_profile.arp'), path.join(outputPath, 'adl-bmm', 'aom', 'shr_aom_profile.arp'));

  //BMM Files
  mkdirp.sync(path.join(outputPath, 'adl-bmm', 'rm_schemas'));
  fs.copyFileSync(path.join(__dirname, 'bmm', 'static', 'SHR_RM_PRIMITIVES.v.0.0.1.bmm'), path.join(outputPath, 'adl-bmm', 'rm_schemas', 'SHR_RM_PRIMITIVES.v.0.0.1.bmm'));
  const bmmResults = BmmExporter.exportToBmm(specs, config);
  const hierarchyPath =  path.join(outputPath, 'adl-bmm', 'rm_schemas', 'SHR_RM_CLINICAL.v.0.0.1.bmm');
  mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
  fs.writeFileSync(hierarchyPath, bmmResults);

  //ADL Files
  const adlResults = AdlExporter.exportToADL(specs, config);
  mkdirp.sync(path.join(outputPath, 'adl-bmm', 'adl-repo'));
  fs.copyFileSync(path.join(__dirname, 'adl', 'static', '_repo.idx'), path.join(outputPath, 'adl-bmm', 'adl-repo', '_repo.idx'));
  fs.copyFileSync(path.join(__dirname, 'adl', 'static', '_repo_lib.idx'), path.join(outputPath, 'adl-bmm', 'adl-repo', '_repo_lib.idx'));
  for (const adlEl in adlResults) {
    const hierarchyPath = path.join(outputPath, 'adl-bmm', 'adl-repo', `SHR-CORE-${adlEl}.v0.0.1.adls`);
    mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
    fs.writeFileSync(hierarchyPath, adlResults[adlEl]);
  }

  //ReadME
  fs.copyFileSync(path.join(__dirname, 'readme.md'), path.join(outputPath, 'adl-bmm', 'readme.md'));
}

module.exports = { generateADLtoPath, setLogger };