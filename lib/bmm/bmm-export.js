const bunyan = require('bunyan');
const { BmmFormatter } = require('./bmm-formatter.js');
const { BmmSpecs } = require('./bmm-constructor.js');
// const fs = require('fs');
// const path = require('path');

var rootLogger = bunyan.createLogger({ name: 'shr-bmm-export' });
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
  require('./bmm-constructor.js').setLogger(logger);
}

function exportToBmm(specs, config) {
  const exporter = new BmmExporter(specs, config);
  return exporter.export();
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


module.exports = { exportToBmm, setLogger };