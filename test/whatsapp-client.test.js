const test = require('node:test');
const assert = require('node:assert/strict');

const { WhatsAppService } = require('../src/whatsapp/client');

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
