const { config } = require('../config');
const { SettingsManager } = require('./manager');

const settingsManager = new SettingsManager({
  filePath: config.settingsFile,
  defaults: {
    sendDelayMinMs: config.sendDelayMinMs,
    sendDelayMaxMs: config.sendDelayMaxMs,
  },
});

module.exports = { settingsManager };
