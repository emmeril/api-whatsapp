const fs = require('node:fs');
const path = require('node:path');

function settingsError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'INVALID_SETTINGS';
  return error;
}

function normalizeDelay(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 300000) {
    throw settingsError(`${name} harus berupa bilangan bulat antara 0 dan 300000`);
  }
  return parsed;
}

function normalizeSettings(input) {
  const sendDelayMinMs = normalizeDelay(input.sendDelayMinMs, 'sendDelayMinMs');
  const sendDelayMaxMs = normalizeDelay(input.sendDelayMaxMs, 'sendDelayMaxMs');
  if (sendDelayMaxMs < sendDelayMinMs) {
    throw settingsError('sendDelayMaxMs tidak boleh lebih kecil dari sendDelayMinMs');
  }
  return { sendDelayMinMs, sendDelayMaxMs };
}

class SettingsManager {
  constructor({ filePath, defaults }) {
    this.filePath = filePath;
    this.settings = normalizeSettings(defaults);
    this.writeQueue = Promise.resolve();
    this.updateQueue = Promise.resolve();
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;

    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.settings = normalizeSettings({ ...this.settings, ...stored });
    } catch (error) {
      console.error(`Gagal membaca settings dari ${this.filePath}:`, error.message);
    }
  }

  get() {
    return { ...this.settings };
  }

  update(input) {
    const operation = this.updateQueue.then(() => this.applyUpdate(input));
    this.updateQueue = operation.catch(() => {});
    return operation;
  }

  async applyUpdate(input) {
    const previous = this.settings;
    this.settings = normalizeSettings({ ...previous, ...input });

    try {
      await this.persist();
    } catch (error) {
      this.settings = previous;
      throw error;
    }

    return this.get();
  }

  persist() {
    if (!this.filePath) return Promise.resolve();

    const serialized = `${JSON.stringify(this.settings, null, 2)}\n`;
    const operation = this.writeQueue.then(async () => {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
      await fs.promises.writeFile(temporaryPath, serialized, 'utf8');
      await fs.promises.rename(temporaryPath, this.filePath);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }
}

module.exports = { SettingsManager, normalizeSettings };
