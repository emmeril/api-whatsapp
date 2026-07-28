const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const { config } = require('../config');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.status = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.lastError = null;
    this.initializePromise = null;
  }

  createClient() {
    const puppeteer = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    };

    if (config.chromeExecutablePath) {
      puppeteer.executablePath = config.chromeExecutablePath;
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.clientId,
        dataPath: config.sessionPath,
      }),
      puppeteer,
    });

    client.on('qr', (qr) => {
      if (this.client !== client) return;
      console.log(`Status WhatsApp ${this.status} -> QR_REQUIRED`);
      this.status = 'QR_REQUIRED';
      QRCode.toDataURL(qr, { width: 360, margin: 2 })
        .then((dataUrl) => {
          if (this.client !== client || this.status !== 'QR_REQUIRED') return;
          this.qrDataUrl = dataUrl;
          console.log('QR WhatsApp siap dipindai melalui endpoint GET /device/qr');
        })
        .catch((error) => {
          this.lastError = `Gagal membuat QR: ${error.message}`;
          console.error(this.lastError);
        });
    });

    client.on('authenticated', () => {
      if (this.client !== client) return;
      this.status = 'AUTHENTICATED';
      this.qrDataUrl = null;
      console.log('WhatsApp berhasil diautentikasi');
    });

    client.on('ready', () => {
      if (this.client !== client) return;
      this.status = 'READY';
      this.qrDataUrl = null;
      this.lastError = null;
      console.log('WhatsApp siap mengirim pesan');
    });

    client.on('auth_failure', (message) => {
      if (this.client !== client) return;
      this.status = 'AUTH_FAILURE';
      this.lastError = message;
      console.error('Autentikasi WhatsApp gagal:', message);
    });

    client.on('disconnected', (reason) => {
      if (this.client !== client) return;
      this.status = 'DISCONNECTED';
      this.qrDataUrl = null;
      this.lastError = String(reason);
      this.client = null;
      this.initializePromise = null;
      console.warn('WhatsApp terputus:', reason);
    });

    return client;
  }

  async startClient() {
    console.log(`Memulai WhatsApp client dari status ${this.status}`);

    if (this.client) {
      const previousClient = this.client;
      this.client = null;
      await previousClient.destroy().catch(() => {});
    }

    this.status = 'INITIALIZING';
    this.lastError = null;
    const client = this.createClient();
    this.client = client;

    try {
      await client.initialize();
    } catch (error) {
      if (this.client === client) {
        this.status = 'ERROR';
        this.lastError = error.message;
        this.client = null;
      }
      await client.destroy().catch(() => {});
      throw error;
    }
  }

  initialize() {
    if (this.status === 'READY') return Promise.resolve();
    if (this.initializePromise) return this.initializePromise;

    // Jangan mengganti browser yang masih aktif, terutama saat menunggu QR dipindai.
    if (
      this.client
      && ['INITIALIZING', 'QR_REQUIRED', 'AUTHENTICATED'].includes(this.status)
    ) {
      return Promise.resolve();
    }

    this.initializePromise = this.startClient()
      .finally(() => {
        this.initializePromise = null;
      });

    return this.initializePromise;
  }

  async getStatus() {
    let whatsappState = null;

    if (this.client && this.status === 'READY') {
      try {
        whatsappState = await this.client.getState();
      } catch (error) {
        this.lastError = error.message;
      }
    }

    return {
      state: this.status,
      whatsappState,
      ready: this.status === 'READY',
      hasQr: Boolean(this.qrDataUrl),
      lastError: this.lastError,
      account: this.client?.info
        ? {
            wid: this.client.info.wid?._serialized,
            pushname: this.client.info.pushname,
            platform: this.client.info.platform,
          }
        : null,
    };
  }

  getQr() {
    return this.qrDataUrl;
  }

  requireReady() {
    if (!this.client || this.status !== 'READY') {
      const error = new Error('WhatsApp belum terhubung. Pindai QR terlebih dahulu.');
      error.statusCode = 503;
      error.code = 'WHATSAPP_NOT_READY';
      throw error;
    }
  }

  async send({ chatId, message, media }) {
    this.requireReady();

    const registered = await this.client.isRegisteredUser(chatId);
    if (!registered) {
      const error = new Error('Nomor tujuan tidak terdaftar di WhatsApp');
      error.statusCode = 422;
      error.code = 'NUMBER_NOT_REGISTERED';
      throw error;
    }

    let result;
    if (media) {
      const messageMedia = media.url
        ? await MessageMedia.fromUrl(media.url, { unsafeMime: true })
        : new MessageMedia(media.mimetype, media.data, media.filename);

      if (media.filename) messageMedia.filename = media.filename;

      result = await this.client.sendMessage(chatId, messageMedia, {
        caption: message || undefined,
        sendMediaAsDocument: Boolean(media.asDocument),
      });
    } else {
      result = await this.client.sendMessage(chatId, message);
    }

    return result;
  }

  async logout() {
    if (!this.client) {
      this.status = 'DISCONNECTED';
      return;
    }

    // logout() juga menutup browser dan membersihkan sesi LocalAuth.
    await this.client.logout();
    this.client = null;
    this.status = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.initializePromise = null;
  }

  async destroy() {
    if (this.client) await this.client.destroy();
    this.client = null;
    this.status = 'DISCONNECTED';
  }
}

const whatsapp = new WhatsAppService();

module.exports = { whatsapp };
