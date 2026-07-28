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
}

module.exports = { config, validateConfig };
