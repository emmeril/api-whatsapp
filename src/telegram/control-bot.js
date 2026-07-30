const { config } = require('../config');
const { commandManager } = require('../commands');
const { settingsManager } = require('../settings');
const { normalizePhoneNumber, toWhatsAppId } = require('../utils/phone');
const { whatsapp } = require('../whatsapp/client');
const { telegramClient } = require('./client');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseCommand(text) {
  const match = String(text || '').trim().match(
    /^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i,
  );
  if (!match) return null;
  return { name: match[1].toLowerCase(), argsText: (match[2] || '').trim() };
}

function splitArgs(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function parseDelayRange(value) {
  const args = splitArgs(value);
  if (args.length !== 2) throw new Error('Format: /wa_delay <min_detik> <max_detik>');

  const min = Number(args[0]);
  const max = Number(args[1]);
  if (
    !Number.isInteger(min)
    || !Number.isInteger(max)
    || min < 0
    || max < 0
    || min > 300
    || max > 300
  ) {
    throw new Error('Delay harus berupa bilangan bulat 0-300 detik');
  }
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

class TelegramControlBot {
  constructor({
    telegram = telegramClient,
    whatsappService = whatsapp,
    commands = commandManager,
    settings = settingsManager,
    logger = console,
  } = {}) {
    this.telegram = telegram;
    this.whatsapp = whatsappService;
    this.commands = commands;
    this.settings = settings;
    this.logger = logger;
    this.running = false;
    this.offset = 0;
    this.abortController = null;
    this.pollPromise = null;
  }

  getAdminUserIds() {
    return String(config.telegramAdminUserIds || '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  isAuthorized(update) {
    const message = update?.message || update?.callback_query?.message;
    const chatId = String(message?.chat?.id ?? '');
    if (!chatId || !this.telegram.getChatIds().includes(chatId)) return false;

    const adminUserIds = this.getAdminUserIds();
    if (adminUserIds.length === 0) return true;
    const userId = String(update?.message?.from?.id ?? update?.callback_query?.from?.id ?? '');
    return adminUserIds.includes(userId);
  }

  start() {
    if (!this.telegram.isConfigured()) {
      this.logger.log('Kontrol Telegram tidak aktif atau belum dikonfigurasi');
      return Promise.resolve(false);
    }
    if (this.running) return Promise.resolve(true);

    this.running = true;
    this.pollPromise = this.run();
    return Promise.resolve(true);
  }

  async stop() {
    this.running = false;
    this.abortController?.abort();
    await this.pollPromise?.catch(() => {});
    this.pollPromise = null;
  }

  async prepare() {
    await this.telegram.deleteWebhook();
    await this.telegram.setMyCommands([
      { command: 'wa', description: 'Buka menu kontrol WhatsApp' },
      { command: 'wa_status', description: 'Lihat status perangkat' },
      { command: 'wa_send', description: 'Kirim pesan WhatsApp' },
      { command: 'wa_delay', description: 'Atur delay pengiriman' },
      { command: 'wa_commands', description: 'Lihat command WhatsApp' },
    ]);
  }

  async run() {
    let prepared = false;
    while (this.running) {
      try {
        if (!prepared) {
          await this.prepare();
          prepared = true;
          this.logger.log('Kontrol Telegram siap menerima command');
        }

        this.abortController = new AbortController();
        const updates = await this.telegram.getUpdates(
          this.offset,
          this.abortController.signal,
        );
        for (const update of updates || []) {
          this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        if (this.running) {
          this.logger.error('Kontrol Telegram gagal:', error.message);
          await sleep(3000);
        }
      } finally {
        this.abortController = null;
      }
    }
  }

  async handleUpdate(update) {
    if (!this.isAuthorized(update)) return { handled: false, reason: 'unauthorized' };
    if (update.callback_query) return this.handleCallback(update.callback_query);
    if (update.message) return this.handleMessage(update.message);
    return { handled: false, reason: 'unsupported' };
  }

  send(chatId, text, options = {}) {
    return this.telegram.sendMessage(chatId, text, options);
  }

  async handleMessage(message) {
    const chatId = String(message.chat.id);
    const parsed = parseCommand(message.text || message.caption || '');
    if (!parsed) return { handled: false };

    try {
      if (['start', 'wa', 'wa_menu'].includes(parsed.name)) await this.sendMenu(chatId);
      else if (parsed.name === 'wa_help') await this.sendHelp(chatId);
      else if (parsed.name === 'wa_status') await this.sendStatus(chatId);
      else if (parsed.name === 'wa_connect') await this.connect(chatId);
      else if (parsed.name === 'wa_qr') await this.sendQr(chatId);
      else if (parsed.name === 'wa_logout') await this.confirmLogout(chatId);
      else if (parsed.name === 'wa_send') await this.sendText(chatId, parsed.argsText);
      else if (parsed.name === 'wa_media') await this.sendMediaUrl(chatId, parsed.argsText);
      else if (parsed.name === 'wa_document') {
        await this.sendMediaUrl(chatId, parsed.argsText, true);
      } else if (parsed.name === 'wa_file') {
        await this.sendTelegramFile(chatId, message, parsed.argsText);
      } else if (parsed.name === 'wa_delay') await this.updateDelay(chatId, parsed.argsText);
      else if (parsed.name === 'wa_settings') await this.sendSettings(chatId);
      else if (parsed.name === 'wa_commands') await this.sendCommands(chatId);
      else if (parsed.name === 'wa_command_set') await this.setStaticCommand(chatId, parsed.argsText);
      else if (parsed.name === 'wa_command_webhook') {
        await this.setWebhookCommand(chatId, parsed.argsText);
      } else if (parsed.name === 'wa_command_toggle') {
        await this.toggleCommand(chatId, parsed.argsText);
      } else if (parsed.name === 'wa_command_delete') {
        await this.confirmDeleteCommand(chatId, parsed.argsText);
      } else await this.send(chatId, 'Command tidak dikenal. Gunakan /wa_help.');

      return { handled: true };
    } catch (error) {
      await this.send(chatId, `Gagal: ${error.message}`);
      return { handled: true, error };
    }
  }

  async handleCallback(callback) {
    const chatId = String(callback.message?.chat?.id || '');
    const data = String(callback.data || '');
    await this.telegram.answerCallbackQuery(callback.id).catch(() => {});

    try {
      if (data === 'wa:menu') await this.sendMenu(chatId);
      else if (data === 'wa:status') await this.sendStatus(chatId);
      else if (data === 'wa:connect') await this.connect(chatId);
      else if (data === 'wa:qr') await this.sendQr(chatId);
      else if (data === 'wa:settings') await this.sendSettings(chatId);
      else if (data === 'wa:commands') await this.sendCommands(chatId);
      else if (data === 'wa:help') await this.sendHelp(chatId);
      else if (data === 'wa:logout_confirm') await this.confirmLogout(chatId);
      else if (data === 'wa:logout') {
        await this.whatsapp.logout();
        await this.send(chatId, 'Perangkat WhatsApp berhasil logout.');
      } else if (data.startsWith('wa:delete:')) {
        const command = data.slice('wa:delete:'.length);
        await this.commands.remove(command);
        await this.send(chatId, `Command /${command} berhasil dihapus.`);
      }
      return { handled: true };
    } catch (error) {
      await this.send(chatId, `Gagal: ${error.message}`);
      return { handled: true, error };
    }
  }

  sendMenu(chatId) {
    return this.send(chatId, 'Kontrol API WhatsApp', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Status', callback_data: 'wa:status' }, { text: 'Connect', callback_data: 'wa:connect' }],
          [{ text: 'Kirim QR', callback_data: 'wa:qr' }, { text: 'Logout', callback_data: 'wa:logout_confirm' }],
          [{ text: 'Daftar command', callback_data: 'wa:commands' }, { text: 'Pengaturan delay', callback_data: 'wa:settings' }],
          [{ text: 'Bantuan', callback_data: 'wa:help' }],
        ],
      },
    });
  }

  sendHelp(chatId) {
    return this.send(chatId, [
      '/wa - buka menu kontrol',
      '/wa_status - status perangkat',
      '/wa_connect - mulai koneksi',
      '/wa_qr - kirim QR login',
      '/wa_logout - logout dengan konfirmasi',
      '/wa_send <nomor> <pesan> - kirim teks',
      '/wa_media <nomor> <url> [caption] - kirim media',
      '/wa_document <nomor> <url> [caption] - kirim dokumen URL',
      '/wa_file <nomor> [caption] - gunakan sebagai caption file Telegram',
      '/wa_delay <min> <max> - atur delay dalam detik',
      '/wa_settings - lihat delay',
      '/wa_commands - daftar command',
      '/wa_command_set <nama> <response>',
      '/wa_command_webhook <nama> <url> [fallback]',
      '/wa_command_toggle <nama> on|off',
      '/wa_command_delete <nama>',
    ].join('\n'));
  }

  async sendStatus(chatId) {
    const status = await this.whatsapp.getStatus();
    await this.send(chatId, [
      'Status API WhatsApp',
      `State: ${status.state}`,
      `Ready: ${status.ready ? 'YA' : 'TIDAK'}`,
      `Akun: ${status.account?.wid || status.account?.pushname || '-'}`,
      `Error terakhir: ${status.lastError || '-'}`,
    ].join('\n'));
  }

  async connect(chatId) {
    const status = await this.whatsapp.getStatus();
    if (status.ready) {
      await this.send(chatId, 'WhatsApp sudah terhubung.');
      return;
    }
    this.whatsapp.initialize().catch((error) => {
      this.logger.error('Koneksi WhatsApp dari Telegram gagal:', error.message);
    });
    await this.send(chatId, 'Proses koneksi dimulai. Gunakan /wa_qr untuk mengambil QR.');
  }

  async sendQr(chatId) {
    const qr = this.whatsapp.getQr();
    if (!qr) throw new Error('QR belum tersedia atau perangkat sudah terhubung');
    await this.telegram.sendPhoto(
      chatId,
      qr,
      'Scan melalui WhatsApp > Perangkat tertaut > Tautkan perangkat.',
    );
  }

  confirmLogout(chatId) {
    return this.send(chatId, 'Logout akan memutus sesi WhatsApp. Lanjutkan?', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Ya, logout', callback_data: 'wa:logout' },
          { text: 'Batal', callback_data: 'wa:menu' },
        ]],
      },
    });
  }

  normalizeTarget(target) {
    const normalized = normalizePhoneNumber(target, config.countryCode);
    return {
      normalized,
      chatId: toWhatsAppId(normalized, config.countryCode),
    };
  }

  async sendText(chatId, value) {
    const match = String(value || '').match(/^(\S+)\s+([\s\S]+)$/);
    if (!match) throw new Error('Format: /wa_send <nomor> <pesan>');
    const target = this.normalizeTarget(match[1]);
    await this.whatsapp.send({ chatId: target.chatId, message: match[2] });
    await this.send(chatId, `Pesan berhasil dikirim ke ${target.normalized}.`);
  }

  async sendMediaUrl(chatId, value, asDocument = false) {
    const match = String(value || '').match(/^(\S+)\s+(https?:\/\/\S+)(?:\s+([\s\S]*))?$/i);
    if (!match) throw new Error('Format: /wa_media <nomor> <url> [caption]');
    const target = this.normalizeTarget(match[1]);
    await this.whatsapp.send({
      chatId: target.chatId,
      message: match[3] || '',
      media: { url: new URL(match[2]).toString(), asDocument },
    });
    await this.send(
      chatId,
      `${asDocument ? 'Dokumen' : 'Media'} berhasil dikirim ke ${target.normalized}.`,
    );
  }

  async sendTelegramFile(chatId, message, value) {
    const targetValue = splitArgs(value)[0];
    if (!targetValue) throw new Error('Format caption file: /wa_file <nomor> [caption]');

    const document = message.document;
    const photo = Array.isArray(message.photo) ? message.photo.at(-1) : null;
    const fileId = document?.file_id || photo?.file_id;
    if (!fileId) throw new Error('File Telegram tidak ditemukan');
    if (document?.file_size > 18 * 1024 * 1024) {
      throw new Error('File terlalu besar; maksimum 18 MB');
    }

    const target = this.normalizeTarget(targetValue);
    const buffer = await this.telegram.downloadFile(fileId);
    const caption = String(value).replace(/^\S+\s*/, '').trim();
    await this.whatsapp.send({
      chatId: target.chatId,
      message: caption,
      media: {
        data: buffer.toString('base64'),
        mimetype: document?.mime_type || 'image/jpeg',
        filename: document?.file_name || 'telegram-file',
        asDocument: Boolean(document),
      },
    });
    await this.send(chatId, `File berhasil dikirim ke ${target.normalized}.`);
  }

  async updateDelay(chatId, value) {
    const { min, max } = parseDelayRange(value);
    const settings = await this.settings.update({
      sendDelayMinMs: min * 1000,
      sendDelayMaxMs: max * 1000,
    });
    await this.send(
      chatId,
      `Delay pengiriman diatur ${settings.sendDelayMinMs / 1000}-${settings.sendDelayMaxMs / 1000} detik.`,
    );
  }

  async sendSettings(chatId) {
    const settings = this.settings.get();
    await this.send(
      chatId,
      `Delay pengiriman: ${settings.sendDelayMinMs / 1000}-${settings.sendDelayMaxMs / 1000} detik.`,
    );
  }

  async sendCommands(chatId) {
    const entries = this.commands.list();
    if (entries.length === 0) {
      await this.send(chatId, 'Belum ada command WhatsApp.');
      return;
    }
    const lines = entries.map((entry) => (
      `${entry.command} ${entry.enabled ? '[on]' : '[off]'} - `
      + `${entry.description || (entry.webhookUrl ? 'webhook' : 'response')}`
    ));
    const text = `Daftar command WhatsApp:\n${lines.join('\n')}`;
    await this.send(chatId, text.length > 4000 ? `${text.slice(0, 3970)}\n...` : text);
  }

  async setStaticCommand(chatId, value) {
    const match = String(value || '').match(/^(\S+)\s+([\s\S]+)$/);
    if (!match) throw new Error('Format: /wa_command_set <nama> <response>');
    const entry = await this.commands.set({
      command: match[1],
      response: match[2],
      webhookUrl: null,
    });
    await this.send(chatId, `${entry.command} berhasil disimpan.`);
  }

  async setWebhookCommand(chatId, value) {
    const match = String(value || '').match(/^(\S+)\s+(https?:\/\/\S+)(?:\s+([\s\S]*))?$/i);
    if (!match) throw new Error('Format: /wa_command_webhook <nama> <url> [fallback]');
    const entry = await this.commands.set({
      command: match[1],
      webhookUrl: match[2],
      response: match[3] || null,
    });
    await this.send(chatId, `${entry.command} webhook berhasil disimpan.`);
  }

  async toggleCommand(chatId, value) {
    const args = splitArgs(value);
    if (args.length !== 2 || !['on', 'off'].includes(args[1].toLowerCase())) {
      throw new Error('Format: /wa_command_toggle <nama> on|off');
    }
    const existing = this.commands.get(args[0]);
    if (!existing) throw new Error(`Command /${args[0].replace(/^\//, '')} tidak ditemukan`);
    const entry = await this.commands.set({
      ...existing,
      enabled: args[1].toLowerCase() === 'on',
    });
    await this.send(chatId, `${entry.command} sekarang ${entry.enabled ? 'aktif' : 'nonaktif'}.`);
  }

  async confirmDeleteCommand(chatId, value) {
    const command = splitArgs(value)[0]?.replace(/^\//, '').toLowerCase();
    if (!command) throw new Error('Format: /wa_command_delete <nama>');
    if (!this.commands.get(command)) throw new Error(`Command /${command} tidak ditemukan`);
    await this.send(chatId, `Hapus command /${command}?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Hapus', callback_data: `wa:delete:${command}` },
          { text: 'Batal', callback_data: 'wa:menu' },
        ]],
      },
    });
  }
}

const telegramControlBot = new TelegramControlBot();

module.exports = { TelegramControlBot, telegramControlBot, parseCommand, parseDelayRange };
