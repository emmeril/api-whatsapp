const { app } = require('./app');
const { config, validateConfig } = require('./config');
const { telegramControlBot } = require('./telegram/control-bot');
const { whatsapp } = require('./whatsapp/client');

validateConfig();

const server = app.listen(config.port, () => {
  console.log(`API WhatsApp aktif di http://localhost:${config.port}`);

  if (config.autoConnect) {
    whatsapp.initialize().catch((error) => {
      console.error('Koneksi WhatsApp otomatis gagal:', error);
    });
  }

  telegramControlBot.start().catch((error) => {
    console.error('Kontrol Telegram gagal dimulai:', error.message);
  });
});

async function shutdown(signal) {
  console.log(`${signal} diterima, menutup aplikasi...`);
  server.close(async () => {
    try {
      await telegramControlBot.stop();
      await whatsapp.destroy();
      process.exit(0);
    } catch (error) {
      console.error('Gagal menutup WhatsApp:', error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
