const test = require('node:test');
const assert = require('node:assert/strict');

const { sendMessage } = require('../src/routes/messages');
const { whatsapp } = require('../src/whatsapp/client');

test('tetap mengembalikan sukses ketika metadata pesan tidak tersedia', async () => {
  const originalSend = whatsapp.send;
  let responseBody;
  let nextError;

  whatsapp.send = async () => undefined;

  try {
    await sendMessage(
      { body: { target: '087728972090', message: 'Halo dari API' } },
      {
        json(body) {
          responseBody = body;
          return body;
        },
      },
      (error) => {
        nextError = error;
      },
    );
  } finally {
    whatsapp.send = originalSend;
  }

  assert.equal(nextError, undefined);
  assert.equal(responseBody.status, true);
  assert.equal(responseBody.data.id, null);
  assert.equal(responseBody.data.target, '6287728972090');
  assert.equal(responseBody.data.timestamp, null);
  assert.equal(responseBody.data.type, 'chat');
});

test('memulihkan client ketika Puppeteer memakai frame yang sudah terlepas', async () => {
  const original = {
    client: whatsapp.client,
    status: whatsapp.status,
    desiredRunning: whatsapp.desiredRunning,
    scheduleReconnect: whatsapp.scheduleReconnect,
  };
  let destroyed = false;
  let reconnectReason;

  whatsapp.client = {
    isRegisteredUser: async () => {
      throw new Error("Attempted to use detached Frame 'ABC'");
    },
    destroy: async () => {
      destroyed = true;
    },
  };
  whatsapp.status = 'READY';
  whatsapp.desiredRunning = true;
  whatsapp.scheduleReconnect = (reason) => {
    reconnectReason = reason;
  };

  try {
    await assert.rejects(
      whatsapp.send({ chatId: '6287728972090@c.us', message: 'Halo' }),
      (error) => error.code === 'WHATSAPP_RECOVERING' && error.statusCode === 503,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(whatsapp.status, 'DISCONNECTED');
    assert.equal(whatsapp.client, null);
    assert.equal(destroyed, true);
    assert.match(reconnectReason, /detached Frame/);
  } finally {
    whatsapp.client = original.client;
    whatsapp.status = original.status;
    whatsapp.desiredRunning = original.desiredRunning;
    whatsapp.scheduleReconnect = original.scheduleReconnect;
  }
});
