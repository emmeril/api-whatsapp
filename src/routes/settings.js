const express = require('express');

const { settingsManager } = require('../settings');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ status: true, data: settingsManager.get() });
});

router.put('/', async (req, res, next) => {
  try {
    const settings = await settingsManager.update(req.body || {});
    res.json({ status: true, message: 'Pengaturan berhasil diperbarui', data: settings });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
