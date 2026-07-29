const { postWebhook } = require('../utils/webhook');

// Meneruskan pesan masuk yang bukan command ke aplikasi lain, misalnya bot
// pencatat cashflow yang memakai pola `+10000 Gaji #bank` dan trigger grup.
class MessageWebhook {
  constructor({
    url = '',
    secret = '',
    timeoutMs = 10000,
    fetchImpl = global.fetch,
  } = {}) {
    this.url = url;
    this.secret = secret;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  get enabled() {
    return Boolean(this.url);
  }

  buildPayload(message) {
    const chatId = message.from;
    const isGroup = typeof chatId === 'string' && chatId.endsWith('@g.us');

    return {
      event: 'whatsapp.message',
      text: message.body,
      from: message.author || chatId,
      chatId,
      isGroup,
      type: message.type || 'chat',
      messageId: message.id?._serialized || null,
      timestamp: message.timestamp || null,
    };
  }

  async forward(message) {
    if (!this.enabled) return { forwarded: false, replied: false };

    if (
      !message
      || message.fromMe
      || message.from === 'status@broadcast'
      || !String(message.body || '').trim()
    ) {
      return { forwarded: false, replied: false };
    }

    const reply = await postWebhook({
      url: this.url,
      payload: this.buildPayload(message),
      secret: this.secret,
      secretHeader: 'x-message-secret',
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      label: 'pesan',
    });

    if (!reply) return { forwarded: true, replied: false };

    await message.reply(reply);
    return { forwarded: true, replied: true };
  }
}

module.exports = { MessageWebhook };
