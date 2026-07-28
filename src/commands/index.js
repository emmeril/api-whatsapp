const { config } = require('../config');
const { CommandManager } = require('./manager');

const commandManager = new CommandManager({
  filePath: config.commandsFile,
  webhookSecret: config.commandWebhookSecret,
  webhookTimeoutMs: config.commandWebhookTimeoutMs,
  defaults: [
    {
      command: 'start',
      response: 'Halo! Bot WhatsApp aktif. Silakan ketik command yang tersedia.',
      description: 'Memulai percakapan dengan bot',
      enabled: true,
    },
  ],
});

module.exports = { commandManager };
