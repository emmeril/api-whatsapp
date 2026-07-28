const fs = require('node:fs');
const path = require('node:path');

const COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/i;

function commandError(message, statusCode = 400, code = 'INVALID_COMMAND') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeCommand(value) {
  const command = String(value || '').trim().replace(/^\//, '').toLowerCase();

  if (!COMMAND_PATTERN.test(command)) {
    throw commandError('command harus 1-32 karakter berupa huruf, angka, atau underscore');
  }

  return command;
}

function parseCommand(body) {
  if (typeof body !== 'string') return null;

  const match = body.trim().match(/^\/([a-z0-9_]{1,32})(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const argsText = (match[2] || '').trim();
  return {
    command: match[1].toLowerCase(),
    args: argsText ? argsText.split(/\s+/) : [],
    argsText,
    raw: body,
  };
}

function validateWebhookUrl(value) {
  if (value === undefined || value === null || value === '') return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw commandError('webhookUrl tidak valid');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw commandError('webhookUrl hanya mendukung protokol HTTP atau HTTPS');
  }

  return url.toString();
}

function normalizeDefinition(input, existing = {}) {
  const command = normalizeCommand(input.command ?? existing.command);
  const responseValue = input.response !== undefined ? input.response : existing.response;
  const descriptionValue = input.description !== undefined
    ? input.description
    : existing.description;
  const enabledValue = input.enabled !== undefined ? input.enabled : existing.enabled;
  const webhookValue = input.webhookUrl !== undefined
    ? input.webhookUrl
    : existing.webhookUrl;

  if (
    responseValue !== undefined
    && responseValue !== null
    && typeof responseValue !== 'string'
  ) {
    throw commandError('response harus berupa string atau null');
  }

  const response = typeof responseValue === 'string' && responseValue.trim()
    ? responseValue.trim()
    : null;
  const webhookUrl = validateWebhookUrl(webhookValue);

  if (!response && !webhookUrl) {
    throw commandError('response atau webhookUrl wajib diisi');
  }

  if (
    descriptionValue !== undefined
    && descriptionValue !== null
    && typeof descriptionValue !== 'string'
  ) {
    throw commandError('description harus berupa string');
  }

  if (enabledValue !== undefined && typeof enabledValue !== 'boolean') {
    throw commandError('enabled harus berupa boolean');
  }

  return {
    command,
    response,
    webhookUrl,
    description: String(descriptionValue || '').trim(),
    enabled: enabledValue !== false,
  };
}

class CommandManager {
  constructor({
    filePath,
    webhookSecret = '',
    webhookTimeoutMs = 10000,
    defaults = [],
    fetchImpl = global.fetch,
  }) {
    this.filePath = filePath;
    this.webhookSecret = webhookSecret;
    this.webhookTimeoutMs = webhookTimeoutMs;
    this.fetchImpl = fetchImpl;
    this.commands = new Map();
    this.handlers = new Map();
    this.writeQueue = Promise.resolve();

    this.load(defaults);
  }

  load(defaults) {
    let definitions = defaults;

    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        definitions = Array.isArray(stored) ? stored : stored.commands;
        if (!Array.isArray(definitions)) throw new Error('format commands harus berupa array');
      } catch (error) {
        console.error(`Gagal membaca command dari ${this.filePath}:`, error.message);
        definitions = [];
      }
    }

    for (const definition of definitions) {
      try {
        const normalized = normalizeDefinition(definition);
        this.commands.set(normalized.command, normalized);
      } catch (error) {
        console.warn('Command diabaikan karena tidak valid:', error.message);
      }
    }
  }

  list() {
    return [...this.commands.values()]
      .map((entry) => ({ ...entry, command: `/${entry.command}` }))
      .sort((left, right) => left.command.localeCompare(right.command));
  }

  get(command) {
    const normalized = normalizeCommand(command);
    const entry = this.commands.get(normalized);
    return entry ? { ...entry, command: `/${entry.command}` } : null;
  }

  has(command) {
    return this.commands.has(normalizeCommand(command));
  }

  async set(input) {
    const normalizedCommand = normalizeCommand(input.command);
    const existing = this.commands.get(normalizedCommand);
    const entry = normalizeDefinition({ ...input, command: normalizedCommand }, existing);

    this.commands.set(normalizedCommand, entry);
    await this.persist();
    return this.get(normalizedCommand);
  }

  async remove(command) {
    const normalized = normalizeCommand(command);
    if (!this.commands.has(normalized)) return false;

    this.commands.delete(normalized);
    this.handlers.delete(normalized);
    await this.persist();
    return true;
  }

  registerHandler(command, handler) {
    const normalized = normalizeCommand(command);
    if (typeof handler !== 'function') {
      throw commandError('handler command harus berupa function');
    }

    this.handlers.set(normalized, handler);
    return () => this.handlers.delete(normalized);
  }

  persist() {
    if (!this.filePath) return Promise.resolve();

    const serialized = `${JSON.stringify([...this.commands.values()], null, 2)}\n`;
    const operation = this.writeQueue.then(async () => {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
      await fs.promises.writeFile(temporaryPath, serialized, 'utf8');
      await fs.promises.rename(temporaryPath, this.filePath);
    });

    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async callWebhook(entry, context) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Runtime Node.js tidak menyediakan fetch untuk command webhook');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.webhookTimeoutMs);
    const headers = { 'content-type': 'application/json' };

    if (this.webhookSecret) {
      headers.authorization = `Bearer ${this.webhookSecret}`;
      headers['x-command-secret'] = this.webhookSecret;
    }

    try {
      const response = await this.fetchImpl(entry.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'whatsapp.command',
          command: `/${context.command}`,
          args: context.args,
          argsText: context.argsText,
          text: context.raw,
          from: context.from,
          chatId: context.chatId,
          messageId: context.messageId,
          timestamp: context.timestamp,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook command merespons HTTP ${response.status}`);
      }

      const body = await response.text();
      if (!body.trim()) return null;

      const contentType = response.headers?.get?.('content-type') || '';
      if (!contentType.includes('application/json')) return body.trim();

      const payload = JSON.parse(body);
      const reply = payload.reply ?? payload.message ?? null;
      if (reply !== null && typeof reply !== 'string') {
        throw new Error('Field reply dari webhook harus berupa string atau null');
      }
      return reply?.trim() || null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async handleMessage(message) {
    if (!message || message.fromMe || message.from === 'status@broadcast') {
      return { handled: false, replied: false };
    }

    const parsed = parseCommand(message.body);
    if (!parsed) return { handled: false, replied: false };

    const entry = this.commands.get(parsed.command);
    const handler = this.handlers.get(parsed.command);
    if ((entry && !entry.enabled) || (!entry && !handler)) {
      return { handled: false, replied: false };
    }

    const context = {
      ...parsed,
      from: message.author || message.from,
      chatId: message.from,
      messageId: message.id?._serialized || null,
      timestamp: message.timestamp || null,
      message,
    };

    let reply = null;
    if (handler) {
      reply = await handler(context);
    } else if (entry.webhookUrl) {
      try {
        reply = await this.callWebhook(entry, context);
      } catch (error) {
        if (!entry.response) throw error;
        console.error(`Webhook untuk /${entry.command} gagal, memakai response fallback:`, error.message);
        reply = entry.response;
      }
    } else {
      reply = entry.response;
    }

    if (reply === undefined || reply === null || reply === false || reply === '') {
      return { handled: true, replied: false };
    }

    if (typeof reply !== 'string') {
      throw new Error(`Handler /${parsed.command} harus mengembalikan string, null, atau false`);
    }

    await message.reply(reply);
    return { handled: true, replied: true };
  }
}

module.exports = {
  CommandManager,
  normalizeCommand,
  parseCommand,
};
