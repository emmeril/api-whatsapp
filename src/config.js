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
  reconnectBaseDelayMs: Number(process.env.RECONNECT_BASE_DELAY_MS || 5000),
  reconnectMaxDelayMs: Number(process.env.RECONNECT_MAX_DELAY_MS || 60000),
  watchdogIntervalMs: Number(process.env.WATCHDOG_INTERVAL_MS || 30000),
  whatsappOperationTimeoutMs: Number(process.env.WHATSAPP_OPERATION_TIMEOUT_MS || 30000),
  // Pesan keluar diantrekan dan diberi jeda acak agar tidak dikirim bersamaan.
  sendDelayMinMs: Number(process.env.SEND_DELAY_MIN_MS || 1000),
  sendDelayMaxMs: Number(process.env.SEND_DELAY_MAX_MS || 3000),
  countryCode: (process.env.DEFAULT_COUNTRY_CODE || '62').replace(/\D/g, ''),
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
  commandsFile: path.resolve(process.env.COMMANDS_FILE || '.data/commands.json'),
  settingsFile: path.resolve(process.env.SETTINGS_FILE || '.data/settings.json'),
  commandWebhookSecret: process.env.COMMAND_WEBHOOK_SECRET || '',
  commandWebhookTimeoutMs: Number(process.env.COMMAND_WEBHOOK_TIMEOUT_MS || 10000),
  messageWebhookUrl: process.env.MESSAGE_WEBHOOK_URL || '',
  messageWebhookSecret: process.env.MESSAGE_WEBHOOK_SECRET || '',
  messageWebhookTimeoutMs: Number(process.env.MESSAGE_WEBHOOK_TIMEOUT_MS || 10000),
  telegramControlEnabled: parseBoolean(process.env.TELEGRAM_CONTROL_ENABLED, false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramApiUrl: process.env.TELEGRAM_API_URL || 'https://api.telegram.org',
  telegramChatIds: process.env.TELEGRAM_CHAT_IDS || '',
  telegramAdminUserIds: process.env.TELEGRAM_ADMIN_USER_IDS || '',
  telegramPollTimeoutSeconds: Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25),
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

  for (const [name, value] of [
    ['RECONNECT_BASE_DELAY_MS', config.reconnectBaseDelayMs],
    ['RECONNECT_MAX_DELAY_MS', config.reconnectMaxDelayMs],
    ['WATCHDOG_INTERVAL_MS', config.watchdogIntervalMs],
    ['WHATSAPP_OPERATION_TIMEOUT_MS', config.whatsappOperationTimeoutMs],
  ]) {
    if (!Number.isInteger(value) || value < 100) {
      throw new Error(`${name} harus berupa angka minimal 100`);
    }
  }

  for (const [name, value] of [
    ['SEND_DELAY_MIN_MS', config.sendDelayMinMs],
    ['SEND_DELAY_MAX_MS', config.sendDelayMaxMs],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} harus berupa bilangan bulat tidak negatif`);
    }
  }

  if (config.sendDelayMaxMs < config.sendDelayMinMs) {
    throw new Error('SEND_DELAY_MAX_MS tidak boleh lebih kecil dari SEND_DELAY_MIN_MS');
  }

  if (config.reconnectMaxDelayMs < config.reconnectBaseDelayMs) {
    throw new Error('RECONNECT_MAX_DELAY_MS tidak boleh lebih kecil dari RECONNECT_BASE_DELAY_MS');
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

  if (
    !Number.isInteger(config.telegramPollTimeoutSeconds)
    || config.telegramPollTimeoutSeconds < 1
    || config.telegramPollTimeoutSeconds > 50
  ) {
    throw new Error('TELEGRAM_POLL_TIMEOUT_SECONDS harus antara 1 dan 50');
  }

  if (config.telegramControlEnabled) {
    if (!config.telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN wajib diisi ketika kontrol Telegram aktif');
    }
    if (!config.telegramChatIds.trim()) {
      throw new Error('TELEGRAM_CHAT_IDS wajib diisi ketika kontrol Telegram aktif');
    }

    let telegramApiUrl;
    try {
      telegramApiUrl = new URL(config.telegramApiUrl);
    } catch {
      throw new Error('TELEGRAM_API_URL tidak valid');
    }
    if (!['http:', 'https:'].includes(telegramApiUrl.protocol)) {
      throw new Error('TELEGRAM_API_URL hanya mendukung protokol HTTP atau HTTPS');
    }
  }
}

module.exports = { config, validateConfig };
