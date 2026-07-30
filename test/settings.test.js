const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { SettingsManager, normalizeSettings } = require('../src/settings/manager');

test('memvalidasi rentang delay runtime', () => {
  assert.deepEqual(normalizeSettings({
    sendDelayMinMs: 1000,
    sendDelayMaxMs: 3000,
  }), {
    sendDelayMinMs: 1000,
    sendDelayMaxMs: 3000,
  });

  assert.throws(
    () => normalizeSettings({ sendDelayMinMs: 4000, sendDelayMaxMs: 3000 }),
    /tidak boleh lebih kecil/,
  );
});

test('menyimpan dan memuat kembali pengaturan delay', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'api-whatsapp-settings-'));
  const filePath = path.join(directory, 'settings.json');

  try {
    const manager = new SettingsManager({
      filePath,
      defaults: { sendDelayMinMs: 1000, sendDelayMaxMs: 3000 },
    });
    await manager.update({ sendDelayMinMs: 5000, sendDelayMaxMs: 8000 });

    const reloaded = new SettingsManager({
      filePath,
      defaults: { sendDelayMinMs: 1000, sendDelayMaxMs: 3000 },
    });
    assert.deepEqual(reloaded.get(), { sendDelayMinMs: 5000, sendDelayMaxMs: 8000 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
