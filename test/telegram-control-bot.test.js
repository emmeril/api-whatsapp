const test = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../src/config');
const { TelegramControlBot, parseDelayRange } = require('../src/telegram/control-bot');

function createBot() {
  const calls = [];
  const telegram = {
    getChatIds: () => ['123'],
    sendMessage: async (...args) => calls.push(['telegram.sendMessage', ...args]),
    answerCallbackQuery: async (...args) => calls.push(['answerCallbackQuery', ...args]),
  };
  const whatsappService = {
    send: async (payload) => calls.push(['whatsapp.send', payload]),
    getStatus: async () => ({ state: 'READY', ready: true, account: { pushname: 'Test' } }),
    logout: async () => calls.push(['whatsapp.logout']),
  };
  const commands = {
    list: () => [],
    get: () => null,
    set: async (payload) => {
      calls.push(['commands.set', payload]);
      return { command: `/${String(payload.command).replace(/^\//, '')}`, enabled: true };
    },
    remove: async (command) => calls.push(['commands.remove', command]),
  };
  const settings = {
    get: () => ({ sendDelayMinMs: 1000, sendDelayMaxMs: 3000 }),
    update: async (payload) => {
      calls.push(['settings.update', payload]);
      return payload;
    },
  };
  const logger = { log() {}, error() {} };
  return {
    bot: new TelegramControlBot({ telegram, whatsappService, commands, settings, logger }),
    calls,
  };
}

test('memvalidasi rentang delay dari command Telegram', () => {
  assert.deepEqual(parseDelayRange('5 2'), { min: 2, max: 5 });
  assert.throws(() => parseDelayRange('1 301'), /0-300/);
});

test('mengabaikan update dari chat Telegram yang tidak diizinkan', async () => {
  const { bot, calls } = createBot();
  const result = await bot.handleUpdate({
    message: { chat: { id: '999' }, from: { id: '999' }, text: '/wa_status' },
  });

  assert.deepEqual(result, { handled: false, reason: 'unauthorized' });
  assert.deepEqual(calls, []);
});

test('mengatur delay runtime melalui Telegram', async () => {
  const { bot, calls } = createBot();
  await bot.handleUpdate({
    message: { chat: { id: '123' }, from: { id: '123' }, text: '/wa_delay 2 5' },
  });

  assert.deepEqual(calls[0], ['settings.update', {
    sendDelayMinMs: 2000,
    sendDelayMaxMs: 5000,
  }]);
});

test('mengirim pesan dan menyimpan command WhatsApp melalui Telegram', async () => {
  const { bot, calls } = createBot();
  await bot.handleUpdate({
    message: {
      chat: { id: '123' },
      from: { id: '123' },
      text: '/wa_send 081234567890 Halo dari Telegram',
    },
  });
  await bot.handleUpdate({
    message: {
      chat: { id: '123' },
      from: { id: '123' },
      text: '/wa_command_set bantuan Jawaban bantuan',
    },
  });

  assert.deepEqual(calls[0], ['whatsapp.send', {
    chatId: '6281234567890@c.us',
    message: 'Halo dari Telegram',
  }]);
  assert.deepEqual(calls[2], ['commands.set', {
    command: 'bantuan',
    response: 'Jawaban bantuan',
    webhookUrl: null,
  }]);
});

test('membatasi user bila TELEGRAM_ADMIN_USER_IDS diisi', async () => {
  const original = config.telegramAdminUserIds;
  config.telegramAdminUserIds = '42';
  const { bot } = createBot();

  try {
    const denied = await bot.handleUpdate({
      message: { chat: { id: '123' }, from: { id: '7' }, text: '/wa_status' },
    });
    const allowed = await bot.handleUpdate({
      message: { chat: { id: '123' }, from: { id: '42' }, text: '/wa_status' },
    });
    assert.equal(denied.reason, 'unauthorized');
    assert.equal(allowed.handled, true);
  } finally {
    config.telegramAdminUserIds = original;
  }
});

test('logout hanya dijalankan setelah callback konfirmasi', async () => {
  const { bot, calls } = createBot();
  const callback = { id: 'callback', from: { id: '123' }, message: { chat: { id: '123' } } };

  await bot.handleUpdate({ callback_query: { ...callback, data: 'wa:logout_confirm' } });
  assert.equal(calls.some(([name]) => name === 'whatsapp.logout'), false);

  await bot.handleUpdate({ callback_query: { ...callback, id: 'callback-2', data: 'wa:logout' } });
  assert.equal(calls.some(([name]) => name === 'whatsapp.logout'), true);
});
