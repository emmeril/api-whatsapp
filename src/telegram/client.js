const { config } = require('../config');

class TelegramClient {
  getChatIds() {
    return String(config.telegramChatIds || '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  isConfigured() {
    return Boolean(
      config.telegramControlEnabled
      && config.telegramBotToken
      && this.getChatIds().length > 0
    );
  }

  getApiUrl(method) {
    const baseUrl = String(config.telegramApiUrl).replace(/\/+$/, '');
    return `${baseUrl}/bot${config.telegramBotToken}/${method}`;
  }

  async call(method, body = {}, options = {}) {
    const response = await fetch(this.getApiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || `Telegram HTTP ${response.status}`);
    }
    return payload?.result;
  }

  sendMessage(chatId, text, options = {}) {
    return this.call('sendMessage', {
      chat_id: String(chatId),
      text: String(text || ''),
      disable_web_page_preview: true,
      ...options,
    });
  }

  answerCallbackQuery(callbackQueryId) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId });
  }

  getUpdates(offset, signal) {
    return this.call('getUpdates', {
      offset,
      timeout: config.telegramPollTimeoutSeconds,
      allowed_updates: ['message', 'callback_query'],
    }, { signal });
  }

  setMyCommands(commands) {
    return this.call('setMyCommands', { commands });
  }

  deleteWebhook() {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  async sendPhoto(chatId, dataUrl, caption = '') {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('Data gambar Telegram tidak valid');

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', String(caption || ''));
    formData.append(
      'photo',
      new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }),
      'whatsapp-qr.png',
    );

    const response = await fetch(this.getApiUrl('sendPhoto'), {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || `Telegram HTTP ${response.status}`);
    }
    return payload?.result;
  }

  async downloadFile(fileId) {
    const file = await this.call('getFile', { file_id: fileId });
    if (!file?.file_path) throw new Error('File Telegram tidak tersedia');

    const baseUrl = String(config.telegramApiUrl).replace(/\/+$/, '');
    const response = await fetch(
      `${baseUrl}/file/bot${config.telegramBotToken}/${file.file_path}`,
    );
    if (!response.ok) {
      throw new Error(`Gagal mengunduh file Telegram: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

const telegramClient = new TelegramClient();

module.exports = { TelegramClient, telegramClient };
