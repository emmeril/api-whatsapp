const test = require('node:test');
const assert = require('node:assert/strict');

const { MessageWebhook } = require('../src/whatsapp/message-webhook');

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => body,
  };
}

test('tidak aktif ketika MESSAGE_WEBHOOK_URL kosong', async () => {
  const webhook = new MessageWebhook({});
  assert.equal(webhook.enabled, false);
  assert.deepEqual(
    await webhook.forward({ body: '+10000 Gaji #bank', from: 'a@c.us', reply: async () => {} }),
    { forwarded: false, replied: false },
  );
});

test('meneruskan pesan non-command dan membalas hasil webhook', async () => {
  let request;
  const webhook = new MessageWebhook({
    url: 'https://cashflow.example.test/webhooks/whatsapp',
    secret: 'secret-cashflow',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(JSON.stringify({ reply: 'Dicatat pemasukan: Rp10.000' }));
    },
  });
  let reply;

  const result = await webhook.forward({
    body: '+10000 Gaji #bank',
    from: '6281234567890@c.us',
    type: 'chat',
    id: { _serialized: 'message-id' },
    timestamp: 1234567890,
    reply: async (text) => { reply = text; },
  });

  assert.deepEqual(result, { forwarded: true, replied: true });
  assert.equal(request.url, 'https://cashflow.example.test/webhooks/whatsapp');
  assert.equal(request.options.headers.authorization, 'Bearer secret-cashflow');
  assert.equal(request.options.headers['x-message-secret'], 'secret-cashflow');
  assert.deepEqual(JSON.parse(request.options.body), {
    event: 'whatsapp.message',
    text: '+10000 Gaji #bank',
    from: '6281234567890@c.us',
    chatId: '6281234567890@c.us',
    isGroup: false,
    type: 'chat',
    messageId: 'message-id',
    timestamp: 1234567890,
  });
  assert.equal(reply, 'Dicatat pemasukan: Rp10.000');
});

test('menandai pesan grup dan memakai author sebagai pengirim', async () => {
  let request;
  const webhook = new MessageWebhook({
    url: 'https://cashflow.example.test/h',
    fetchImpl: async (url, options) => {
      request = options;
      return jsonResponse('null');
    },
  });

  await webhook.forward({
    body: '!eril /saldo',
    from: '120363000000000000@g.us',
    author: '6281234567890@c.us',
    reply: async () => {},
  });

  const payload = JSON.parse(request.body);
  assert.equal(payload.isGroup, true);
  assert.equal(payload.chatId, '120363000000000000@g.us');
  assert.equal(payload.from, '6281234567890@c.us');
});

test('tidak membalas ketika webhook mengembalikan reply kosong', async () => {
  const webhook = new MessageWebhook({
    url: 'https://cashflow.example.test/h',
    fetchImpl: async () => jsonResponse(JSON.stringify({ reply: null })),
  });
  let replied = false;

  assert.deepEqual(
    await webhook.forward({
      body: 'halo bot',
      from: 'a@c.us',
      reply: async () => { replied = true; },
    }),
    { forwarded: true, replied: false },
  );
  assert.equal(replied, false);
});

test('mengabaikan pesan dari diri sendiri, broadcast, dan pesan kosong', async () => {
  let called = false;
  const webhook = new MessageWebhook({
    url: 'https://cashflow.example.test/h',
    fetchImpl: async () => {
      called = true;
      return jsonResponse('null');
    },
  });
  const skipped = { forwarded: false, replied: false };

  assert.deepEqual(await webhook.forward({ body: 'x', from: 'a@c.us', fromMe: true }), skipped);
  assert.deepEqual(await webhook.forward({ body: 'x', from: 'status@broadcast' }), skipped);
  assert.deepEqual(await webhook.forward({ body: '   ', from: 'a@c.us' }), skipped);
  assert.equal(called, false);
});

test('melaporkan timeout webhook pesan dengan pesan yang jelas', async () => {
  const webhook = new MessageWebhook({
    url: 'https://cashflow.example.test/h',
    timeoutMs: 100,
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });

  await assert.rejects(
    () => webhook.forward({ body: 'x', from: 'a@c.us', reply: async () => {} }),
    /Webhook pesan tidak merespons dalam 100 ms/,
  );
});
