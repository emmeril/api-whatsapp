const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const { config } = require('../config');
const { commandManager } = require('../commands');
const { settingsManager } = require('../settings');
const { MessageWebhook } = require('./message-webhook');

const messageWebhook = new MessageWebhook({
  url: config.messageWebhookUrl,
  secret: config.messageWebhookSecret,
  timeoutMs: config.messageWebhookTimeoutMs,
});

class WhatsAppService {
  constructor() {
    this.client = null;
    this.status = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.lastError = null;
    this.initializePromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.watchdogTimer = null;
    this.watchdogRunning = false;
    this.recoveryPromise = null;
    this.desiredRunning = false;
    this.sendQueue = Promise.resolve();
    this.lastSendAt = null;
  }

  isRecoverableError(error) {
    const message = String(error?.message || error);
    return /detached Frame|Target closed|Session closed|Protocol error|Execution context was destroyed|browser.*disconnect/i.test(message);
  }

  withTimeout(promise, operation) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Timeout saat ${operation}`);
        error.code = 'WHATSAPP_OPERATION_TIMEOUT';
        reject(error);
      }, config.whatsappOperationTimeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  closeClient(client) {
    if (!client) return Promise.resolve();

    const closeTimeout = new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      timer.unref?.();
    });
    return Promise.race([
      Promise.resolve().then(() => client.destroy()).catch(() => {}),
      closeTimeout,
    ]);
  }

  scheduleReconnect(reason, immediate = false) {
    if (
      !this.desiredRunning
      || this.reconnectTimer
      || this.initializePromise
      || this.recoveryPromise
    ) return;

    const exponent = Math.min(this.reconnectAttempts, 4);
    const delay = immediate
      ? 0
      : Math.min(config.reconnectMaxDelayMs, config.reconnectBaseDelayMs * (2 ** exponent));
    this.reconnectAttempts += 1;
    console.warn(`Menjadwalkan reconnect WhatsApp dalam ${delay} ms (${reason})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initialize().catch((error) => {
        console.error('Reconnect WhatsApp gagal:', error.message);
        this.scheduleReconnect(error.message);
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  startWatchdog() {
    if (this.watchdogTimer) return;

    this.watchdogTimer = setInterval(async () => {
      if (!this.client || this.status !== 'READY' || this.watchdogRunning) return;
      const client = this.client;
      this.watchdogRunning = true;
      try {
        const state = await this.withTimeout(
          client.getState(),
          'memeriksa status WhatsApp',
        );
        if (state !== 'CONNECTED') {
          throw new Error(`WhatsApp state ${state || 'UNKNOWN'}`);
        }
      } catch (error) {
        console.error('Watchdog WhatsApp mendeteksi koneksi rusak:', error.message);
        this.recoverClient(error, true, client);
      } finally {
        this.watchdogRunning = false;
      }
    }, config.watchdogIntervalMs);
    this.watchdogTimer.unref?.();
  }

  stopWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  recoverClient(error, immediate = true, expectedClient = null) {
    if (expectedClient && this.client !== expectedClient) return;

    const brokenClient = this.client;
    this.client = null;
    this.status = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.lastError = error?.message || String(error);
    this.lastSendAt = null;

    if (this.recoveryPromise) return;
    if (!brokenClient) {
      this.scheduleReconnect(this.lastError, immediate);
      return;
    }

    this.recoveryPromise = this.closeClient(brokenClient).finally(() => {
      this.recoveryPromise = null;
      this.scheduleReconnect(this.lastError, immediate);
    });
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
      this.reconnectAttempts = 0;
      this.startWatchdog();
      console.log('WhatsApp siap mengirim pesan');
    });

    client.on('auth_failure', (message) => {
      if (this.client !== client) return;
      this.status = 'AUTH_FAILURE';
      this.lastError = message;
      console.error('Autentikasi WhatsApp gagal:', message);
      // Auth failure dapat terjadi tanpa diikuti event disconnected. Bersihkan
      // client lalu biarkan mekanisme reconnect mencoba sesi/QR berikutnya.
      this.recoverClient(new Error(`Autentikasi WhatsApp gagal: ${message}`), false);
    });

    client.on('disconnected', (reason) => {
      if (this.client !== client) return;
      console.warn('WhatsApp terputus:', reason);
      this.recoverClient(new Error(`WhatsApp terputus: ${reason}`), false);
    });

    client.on('change_state', (state) => {
      if (this.client !== client) return;
      if (['TIMEOUT', 'CONFLICT', 'UNPAIRED'].includes(state)) {
        this.recoverClient(new Error(`WhatsApp state ${state}`));
      }
    });

    client.on('message', (message) => {
      if (this.client !== client) return;

      // Command terdaftar diproses lebih dulu; sisanya diteruskan ke webhook
      // pesan agar aplikasi lain dapat menangani pola non-slash.
      commandManager.handleMessage(message)
        .then((result) => {
          if (result.handled) return null;
          return messageWebhook.forward(message);
        })
        .catch((error) => {
          console.error('Gagal memproses pesan WhatsApp:', error.message);
        });
    });

    return client;
  }

  async startClient() {
    console.log(`Memulai WhatsApp client dari status ${this.status}`);

    if (this.client) {
      const previousClient = this.client;
      this.client = null;
      await this.closeClient(previousClient);
    }

    this.status = 'INITIALIZING';
    this.lastError = null;
    const client = this.createClient();
    this.client = client;

    try {
      await this.withTimeout(client.initialize(), 'memulai WhatsApp');
      client.pupBrowser?.once('disconnected', () => {
        if (this.client !== client) return;
        console.error('Proses Chromium WhatsApp terputus');
        this.recoverClient(new Error('Browser WhatsApp disconnected'));
      });
    } catch (error) {
      if (this.client === client) {
        this.status = 'ERROR';
        this.lastError = error.message;
        this.client = null;
      }
      await this.closeClient(client);
      throw error;
    }
  }

  initialize() {
    this.desiredRunning = true;
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
        if (
          this.desiredRunning
          && !this.client
          && ['ERROR', 'DISCONNECTED'].includes(this.status)
        ) {
          this.scheduleReconnect(this.lastError || 'inisialisasi gagal');
        }
      });

    return this.initializePromise;
  }

  async getStatus() {
    let whatsappState = null;

    if (this.client && this.status === 'READY') {
      const client = this.client;
      try {
        whatsappState = await this.withTimeout(
          client.getState(),
          'membaca status WhatsApp',
        );
        if (whatsappState !== 'CONNECTED') {
          throw new Error(`WhatsApp state ${whatsappState || 'UNKNOWN'}`);
        }
      } catch (error) {
        this.recoverClient(error, true, client);
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

  getRandomSendDelayMs() {
    const { sendDelayMinMs: min, sendDelayMaxMs: max } = settingsManager.get();
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForSendDelay() {
    if (this.lastSendAt === null) return;

    const elapsed = Math.max(0, Date.now() - this.lastSendAt);
    const remaining = Math.max(0, this.getRandomSendDelayMs() - elapsed);
    if (remaining > 0) await this.sleep(remaining);
  }

  async sendQueued({ chatId, message, media }) {
    this.requireReady();
    const client = this.client;

    try {
      const registered = await this.withTimeout(
        client.isRegisteredUser(chatId),
        'memeriksa nomor WhatsApp',
      );
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

        await this.waitForSendDelay();
        this.lastSendAt = Date.now();
        result = await this.withTimeout(client.sendMessage(chatId, messageMedia, {
          caption: message || undefined,
          sendMediaAsDocument: Boolean(media.asDocument),
        }), 'mengirim media WhatsApp');
      } else {
        await this.waitForSendDelay();
        this.lastSendAt = Date.now();
        result = await this.withTimeout(
          client.sendMessage(chatId, message),
          'mengirim pesan WhatsApp',
        );
      }

      return result;
    } catch (error) {
      if (this.isRecoverableError(error) || error.code === 'WHATSAPP_OPERATION_TIMEOUT') {
        this.recoverClient(error, true, client);
        const unavailable = new Error(
          'Koneksi WhatsApp sedang dipulihkan. Coba lagi beberapa saat lagi.',
        );
        unavailable.statusCode = 503;
        unavailable.code = 'WHATSAPP_RECOVERING';
        throw unavailable;
      }
      throw error;
    }
  }

  async send(payload) {
    this.requireReady();

    // Serialisasi ini juga berlaku untuk beberapa request HTTP yang masuk
    // bersamaan, sehingga jeda acak benar-benar berada antar pesan.
    const operation = this.sendQueue.then(() => this.sendQueued(payload));
    this.sendQueue = operation.catch(() => {});
    return operation;
  }

  registerCommand(command, handler) {
    return commandManager.registerHandler(command, handler);
  }

  async logout() {
    this.desiredRunning = false;
    this.stopWatchdog();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (!this.client) {
      this.status = 'DISCONNECTED';
      this.lastSendAt = null;
      return;
    }

    // logout() juga menutup browser dan membersihkan sesi LocalAuth.
    await this.client.logout();
    this.client = null;
    this.status = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.initializePromise = null;
    this.lastSendAt = null;
  }

  async destroy() {
    this.desiredRunning = false;
    this.stopWatchdog();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.client) await this.client.destroy();
    this.client = null;
    this.status = 'DISCONNECTED';
    this.lastSendAt = null;
  }
}

const whatsapp = new WhatsAppService();

module.exports = { WhatsAppService, whatsapp };
