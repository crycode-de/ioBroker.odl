const path = require('path');
const { tests } = require('@iobroker/testing');

// Run unit tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.unit(path.join(__dirname, '..'), {
  allowedExitCodes: [11],
  startTimeout: 30000,
  overwriteAdapterConfig(config) {
    config.localityCode = ['DEZ2799'];
    return config;
  }
});
