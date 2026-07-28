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
