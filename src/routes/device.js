const express = require('express');

const { whatsapp } = require('../whatsapp/client');

const router = express.Router();

router.get('/status', async (req, res, next) => {
  try {
    const device = await whatsapp.getStatus();
    res.json({ status: true, device });
  } catch (error) {
    next(error);
  }
});

router.post('/connect', async (req, res, next) => {
  try {
    const current = await whatsapp.getStatus();
    if (current.ready) {
      return res.json({ status: true, message: 'WhatsApp sudah terhubung', device: current });
    }

    whatsapp.initialize().catch((error) => {
      console.error('Gagal menginisialisasi WhatsApp:', error);
    });

    return res.status(202).json({
      status: true,
      message: 'Proses koneksi dimulai. Periksa endpoint GET /device/qr.',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/qr', (req, res) => {
  const qr = whatsapp.getQr();
  if (!qr) {
    return res.status(404).json({
      status: false,
      error: 'QR_NOT_AVAILABLE',
      message: 'QR belum tersedia atau perangkat sudah terhubung',
    });
  }

  return res.json({ status: true, qr });
});

router.get('/qr/image', (req, res) => {
  const qr = whatsapp.getQr();
  if (!qr) {
    return res.status(404).json({
      status: false,
      error: 'QR_NOT_AVAILABLE',
      message: 'QR belum tersedia atau perangkat sudah terhubung',
    });
  }

  const base64 = qr.slice(qr.indexOf(',') + 1);
  res.set('Cache-Control', 'no-store');
  return res.type('png').send(Buffer.from(base64, 'base64'));
});

router.post('/logout', async (req, res, next) => {
  try {
    await whatsapp.logout();
    res.json({ status: true, message: 'Perangkat berhasil logout' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
