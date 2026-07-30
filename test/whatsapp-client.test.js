const test = require('node:test');
const assert = require('node:assert/strict');

const { settingsManager } = require('../src/settings');
const { WhatsAppService } = require('../src/whatsapp/client');

function createReadyService(client) {
  const service = new WhatsAppService();
  service.client = client;
  service.status = 'READY';
  return service;
}

test('recovery menutup client lama sebelum menjadwalkan reconnect', async () => {
  const service = new WhatsAppService();
  let destroyed = false;
  let reconnect;

  service.client = {
    destroy: async () => {
      destroyed = true;
    },
  };
  service.desiredRunning = true;
  service.scheduleReconnect = (reason, immediate) => {
    reconnect = { reason, immediate };
  };

  service.recoverClient(new Error('koneksi jaringan putus'), false);
  await service.recoveryPromise;

  assert.equal(destroyed, true);
  assert.equal(service.client, null);
  assert.equal(service.status, 'DISCONNECTED');
  assert.deepEqual(reconnect, {
    reason: 'koneksi jaringan putus',
    immediate: false,
  });
});

test('recovery saat startup tidak membuka client kedua', async () => {
  const service = new WhatsAppService();
  let rejectInitialization;
  let starts = 0;

  service.startClient = () => {
    starts += 1;
    return new Promise((resolve, reject) => {
      rejectInitialization = reject;
    });
  };
  service.scheduleReconnect = () => {};

  const firstInitialization = service.initialize();
  service.client = { destroy: async () => {} };
  service.recoverClient(new Error('autentikasi gagal'), false);

  const secondInitialization = service.initialize();
  assert.equal(secondInitialization, firstInitialization);
  assert.equal(starts, 1);

  rejectInitialization(new Error('inisialisasi dihentikan'));
  await assert.rejects(firstInitialization, /inisialisasi dihentikan/);
  await service.recoveryPromise;
});

test('startup yang timeout menutup Chromium dan menandai client error', async () => {
  const service = new WhatsAppService();
  let destroyed = false;
  const client = {
    initialize: () => new Promise(() => {}),
    destroy: async () => {
      destroyed = true;
    },
  };

  service.createClient = () => client;
  service.withTimeout = async () => {
    const error = new Error('Timeout saat memulai WhatsApp');
    error.code = 'WHATSAPP_OPERATION_TIMEOUT';
    throw error;
  };

  await assert.rejects(service.startClient(), /Timeout saat memulai WhatsApp/);

  assert.equal(destroyed, true);
  assert.equal(service.client, null);
  assert.equal(service.status, 'ERROR');
  assert.match(service.lastError, /Timeout saat memulai WhatsApp/);
});

test('recovery dari client lama tidak memutus client baru', () => {
  const service = new WhatsAppService();
  const oldClient = { destroy: async () => {} };
  const newClient = { destroy: async () => {} };

  service.client = newClient;
  service.status = 'READY';
  service.recoverClient(new Error('error dari operasi lama'), true, oldClient);

  assert.equal(service.client, newClient);
  assert.equal(service.status, 'READY');
});

test('mengantrekan request paralel agar pesan dikirim berurutan', async () => {
  let releaseFirstSend;
  const events = [];
  const firstSendPending = new Promise((resolve) => {
    releaseFirstSend = resolve;
  });
  const service = createReadyService({
    isRegisteredUser: async () => true,
    sendMessage: async (chatId, message) => {
      events.push(`start:${message}`);
      if (message === 'pertama') await firstSendPending;
      events.push(`finish:${message}`);
      return { chatId };
    },
  });
  service.waitForSendDelay = async () => {};

  const first = service.send({ chatId: '1@c.us', message: 'pertama' });
  const second = service.send({ chatId: '2@c.us', message: 'kedua' });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['start:pertama']);

  releaseFirstSend();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'start:pertama',
    'finish:pertama',
    'start:kedua',
    'finish:kedua',
  ]);
});

test('menunggu sisa jeda acak sejak pengiriman sebelumnya', async () => {
  const originalSettings = settingsManager.get();
  const originalNow = Date.now;
  const service = new WhatsAppService();
  const waits = [];

  settingsManager.settings = { sendDelayMinMs: 1000, sendDelayMaxMs: 1000 };
  service.lastSendAt = 10000;
  service.sleep = async (ms) => waits.push(ms);
  Date.now = () => 10250;

  try {
    await service.waitForSendDelay();
  } finally {
    settingsManager.settings = originalSettings;
    Date.now = originalNow;
  }

  assert.deepEqual(waits, [750]);
});

test('kegagalan satu pesan tidak menghentikan antrean berikutnya', async () => {
  const sent = [];
  const service = createReadyService({
    isRegisteredUser: async (chatId) => chatId !== 'invalid@c.us',
    sendMessage: async (chatId, message) => {
      sent.push({ chatId, message });
      return {};
    },
  });
  service.waitForSendDelay = async () => {};

  const failed = service.send({ chatId: 'invalid@c.us', message: 'gagal' });
  const succeeded = service.send({ chatId: 'valid@c.us', message: 'lanjut' });

  await assert.rejects(failed, (error) => error.code === 'NUMBER_NOT_REGISTERED');
  await succeeded;
  assert.deepEqual(sent, [{ chatId: 'valid@c.us', message: 'lanjut' }]);
});
