const path = require('node:path');

require('dotenv').config();

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const config = {
  port: Number(process.env.PORT || 3000),
  apiToken: process.env.API_TOKEN || '',
  sessionPath: path.resolve(process.env.SESSION_PATH || '.wwebjs_auth'),
  clientId: process.env.CLIENT_ID || 'main',
  autoConnect: parseBoolean(process.env.AUTO_CONNECT, true),
  countryCode: (process.env.DEFAULT_COUNTRY_CODE || '62').replace(/\D/g, ''),
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
  commandsFile: path.resolve(process.env.COMMANDS_FILE || '.data/commands.json'),
  commandWebhookSecret: process.env.COMMAND_WEBHOOK_SECRET || '',
  commandWebhookTimeoutMs: Number(process.env.COMMAND_WEBHOOK_TIMEOUT_MS || 10000),
  messageWebhookUrl: process.env.MESSAGE_WEBHOOK_URL || '',
  messageWebhookSecret: process.env.MESSAGE_WEBHOOK_SECRET || '',
  messageWebhookTimeoutMs: Number(process.env.MESSAGE_WEBHOOK_TIMEOUT_MS || 10000),
};

function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT harus berupa angka antara 1 sampai 65535');
  }

  if (!config.apiToken || config.apiToken.length < 16) {
    throw new Error('API_TOKEN wajib diisi dengan minimal 16 karakter');
  }

  if (!config.countryCode) {
    throw new Error('DEFAULT_COUNTRY_CODE tidak valid');
  }

  if (
    !Number.isInteger(config.commandWebhookTimeoutMs)
    || config.commandWebhookTimeoutMs < 100
    || config.commandWebhookTimeoutMs > 60000
  ) {
    throw new Error('COMMAND_WEBHOOK_TIMEOUT_MS harus antara 100 dan 60000');
  }

  if (
    !Number.isInteger(config.messageWebhookTimeoutMs)
    || config.messageWebhookTimeoutMs < 100
    || config.messageWebhookTimeoutMs > 60000
  ) {
    throw new Error('MESSAGE_WEBHOOK_TIMEOUT_MS harus antara 100 dan 60000');
  }

  if (config.messageWebhookUrl) {
    let url;
    try {
      url = new URL(config.messageWebhookUrl);
    } catch {
      throw new Error('MESSAGE_WEBHOOK_URL tidak valid');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('MESSAGE_WEBHOOK_URL hanya mendukung protokol HTTP atau HTTPS');
    }
  }
}

module.exports = { config, validateConfig };
