const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CommandManager, parseCommand } = require('../src/commands/manager');

test('mem-parsing command dan argumen seperti bot Telegram', () => {
  assert.deepEqual(parseCommand('  /Status INV-123 lunas  '), {
    command: 'status',
    args: ['INV-123', 'lunas'],
    argsText: 'INV-123 lunas',
    raw: '  /Status INV-123 lunas  ',
  });
  assert.equal(parseCommand('pesan biasa'), null);
  assert.equal(parseCommand('/command-tidak-valid'), null);
});

test('membalas command teks statis dan mengabaikan pesan biasa', async () => {
  const manager = new CommandManager({
    defaults: [{ command: 'start', response: 'Halo dari bot' }],
  });
  const replies = [];
  const message = {
    body: '/start',
    from: '6281234567890@c.us',
    reply: async (text) => replies.push(text),
  };

  assert.deepEqual(await manager.handleMessage(message), { handled: true, replied: true });
  assert.deepEqual(replies, ['Halo dari bot']);
  assert.deepEqual(
    await manager.handleMessage({ ...message, body: 'halo' }),
    { handled: false, replied: false },
  );
});

test('mengirim command ke webhook aplikasi lain dan meneruskan reply', async () => {
  let webhookRequest;
  const manager = new CommandManager({
    webhookSecret: 'secret-integrasi',
    defaults: [{ command: 'cek', webhookUrl: 'https://app.example.test/whatsapp' }],
    fetchImpl: async (url, options) => {
      webhookRequest = { url, options };
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ reply: 'Invoice sudah lunas' }),
      };
    },
  });
  let reply;

  await manager.handleMessage({
    body: '/cek INV-123',
    from: '120363000000000000@g.us',
    author: '6281234567890@c.us',
    id: { _serialized: 'message-id' },
    timestamp: 1234567890,
    reply: async (text) => { reply = text; },
  });

  assert.equal(webhookRequest.url, 'https://app.example.test/whatsapp');
  assert.equal(webhookRequest.options.headers.authorization, 'Bearer secret-integrasi');
  assert.equal(webhookRequest.options.headers['x-command-secret'], 'secret-integrasi');
  assert.deepEqual(JSON.parse(webhookRequest.options.body), {
    event: 'whatsapp.command',
    command: '/cek',
    args: ['INV-123'],
    argsText: 'INV-123',
    text: '/cek INV-123',
    from: '6281234567890@c.us',
    chatId: '120363000000000000@g.us',
    messageId: 'message-id',
    timestamp: 1234567890,
  });
  assert.equal(reply, 'Invoice sudah lunas');
});

test('menyimpan command ke file dan memuatnya setelah restart', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-whatsapp-command-'));
  const filePath = path.join(directory, 'commands.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const manager = new CommandManager({ filePath });
  await manager.set({
    command: '/help',
    response: 'Daftar bantuan',
    description: 'Menampilkan bantuan',
  });

  const reloaded = new CommandManager({ filePath });
  assert.deepEqual(reloaded.get('help'), {
    command: '/help',
    response: 'Daftar bantuan',
    webhookUrl: null,
    description: 'Menampilkan bantuan',
    enabled: true,
  });
});

test('tidak mengubah state di memori ketika penyimpanan gagal', async () => {
  // Komponen path berupa file membuat mkdir gagal, mensimulasikan disk error.
  const manager = new CommandManager({
    filePath: path.join(__filename, 'commands.json'),
    defaults: [{ command: 'keep', response: 'tetap ada' }],
  });

  await assert.rejects(() => manager.set({ command: 'baru', response: 'x' }));
  assert.deepEqual(manager.list().map((entry) => entry.command), ['/keep']);

  await assert.rejects(() => manager.remove('keep'));
  assert.deepEqual(manager.list().map((entry) => entry.command), ['/keep']);
});

test('menyelamatkan file command yang rusak dan memakai default', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-whatsapp-corrupt-'));
  const filePath = path.join(directory, 'commands.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(filePath, '{ bukan json valid');

  const manager = new CommandManager({
    filePath,
    defaults: [{ command: 'start', response: 'Halo!' }],
  });

  assert.deepEqual(manager.list().map((entry) => entry.command), ['/start']);
  assert.equal(fs.readFileSync(`${filePath}.corrupt`, 'utf8'), '{ bukan json valid');
});

test('command nonaktif tetap memblokir response tersimpan tapi bukan handler kode', async () => {
  const disabled = new CommandManager({
    defaults: [{ command: 'x', response: 'tersimpan', enabled: false }],
  });
  assert.deepEqual(
    await disabled.handleMessage({ body: '/x', from: 'a@c.us', reply: async () => {} }),
    { handled: false, replied: false },
  );

  const withHandler = new CommandManager({
    defaults: [{ command: 'x', response: 'tersimpan', enabled: false }],
  });
  let reply;
  withHandler.registerHandler('x', () => 'dari handler');
  assert.deepEqual(
    await withHandler.handleMessage({
      body: '/x',
      from: 'a@c.us',
      reply: async (text) => { reply = text; },
    }),
    { handled: true, replied: true },
  );
  assert.equal(reply, 'dari handler');
});

test('menangani payload webhook yang tidak wajar tanpa crash', async () => {
  const build = (body) => new CommandManager({
    defaults: [{ command: 'w', webhookUrl: 'https://app.example.test/h' }],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => body,
    }),
  });

  for (const body of ['null', '{"ok":true}', '""']) {
    assert.deepEqual(
      await build(body).handleMessage({ body: '/w', from: 'a@c.us', reply: async () => {} }),
      { handled: true, replied: false },
    );
  }
});

test('melaporkan timeout webhook dengan pesan yang jelas', async () => {
  const manager = new CommandManager({
    webhookTimeoutMs: 100,
    defaults: [{ command: 'w', webhookUrl: 'https://app.example.test/h' }],
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });

  await assert.rejects(
    () => manager.handleMessage({ body: '/w', from: 'a@c.us', reply: async () => {} }),
    /tidak merespons dalam 100 ms/,
  );
});

test('handler JavaScript dapat menghasilkan balasan dinamis', async () => {
  const manager = new CommandManager({});
  let reply;
  manager.registerHandler('/hello', ({ argsText, from }) => `Halo ${argsText} dari ${from}`);

  await manager.handleMessage({
    body: '/hello Budi',
    from: '6281234567890@c.us',
    reply: async (text) => { reply = text; },
  });

  assert.equal(reply, 'Halo Budi dari 6281234567890@c.us');
});
