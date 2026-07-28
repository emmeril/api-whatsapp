const express = require('express');

const { commandManager } = require('../commands');

const router = express.Router();

function notFoundError(command) {
  const error = new Error(`Command /${String(command).replace(/^\//, '')} tidak ditemukan`);
  error.statusCode = 404;
  error.code = 'COMMAND_NOT_FOUND';
  return error;
}

router.get('/', (req, res) => {
  res.json({ status: true, data: commandManager.list() });
});

router.get('/:command', (req, res, next) => {
  try {
    const command = commandManager.get(req.params.command);
    if (!command) throw notFoundError(req.params.command);
    res.json({ status: true, data: command });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const existed = commandManager.has(req.body.command);
    const command = await commandManager.set(req.body);
    res.status(existed ? 200 : 201).json({
      status: true,
      message: existed ? 'Command berhasil diperbarui' : 'Command berhasil dibuat',
      data: command,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:command', async (req, res, next) => {
  try {
    if (!commandManager.has(req.params.command)) throw notFoundError(req.params.command);
    const command = await commandManager.set({ ...req.body, command: req.params.command });
    res.json({ status: true, message: 'Command berhasil diperbarui', data: command });
  } catch (error) {
    next(error);
  }
});

router.delete('/:command', async (req, res, next) => {
  try {
    const removed = await commandManager.remove(req.params.command);
    if (!removed) throw notFoundError(req.params.command);
    res.json({ status: true, message: 'Command berhasil dihapus' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
