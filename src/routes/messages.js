const express = require('express');

const { config } = require('../config');
const { toWhatsAppId, normalizePhoneNumber } = require('../utils/phone');
const { whatsapp } = require('../whatsapp/client');

const router = express.Router();

function requestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function isEnabled(value) {
  return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(
    String(value || '').toLowerCase(),
  );
}

function parseMedia(body) {
  if (body.url) {
    let url;
    try {
      url = new URL(body.url);
    } catch {
      throw requestError('url media tidak valid');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw requestError('url media hanya mendukung protokol HTTP atau HTTPS');
    }

    return {
      url: url.toString(),
      filename: body.filename,
      asDocument: isEnabled(body.asDocument),
    };
  }

  if (body.file) {
    if (typeof body.file !== 'string') {
      throw requestError('file harus berupa string base64');
    }

    let data = body.file;
    let mimetype = body.mimetype;
    const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/s);

    if (dataUrlMatch) {
      mimetype = mimetype || dataUrlMatch[1];
      data = dataUrlMatch[2];
    }

    if (!mimetype || !/^[\w.+-]+\/[\w.+-]+$/.test(mimetype)) {
      throw requestError('mimetype wajib diisi untuk file base64');
    }

    const compactData = data.replace(/\s/g, '');
    if (
      compactData.length % 4 === 1
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(compactData)
    ) {
      throw requestError('file harus berupa base64 yang valid');
    }

    return {
      data: compactData,
      mimetype,
      filename: body.filename || 'file',
      asDocument: isEnabled(body.asDocument),
    };
  }

  return null;
}

async function sendMessage(req, res, next) {
  try {
    const { target } = req.body;
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const media = parseMedia(req.body);

    if (target === undefined || target === null || target === '') {
      throw requestError('target wajib diisi');
    }

    if (!message && !media) {
      throw requestError('message, url, atau file wajib diisi');
    }

    let normalizedTarget;
    try {
      normalizedTarget = normalizePhoneNumber(target, config.countryCode);
    } catch (error) {
      throw requestError(error.message);
    }
    const result = await whatsapp.send({
      chatId: toWhatsAppId(normalizedTarget, config.countryCode),
      message,
      media,
    });

    return res.json({
      status: true,
      message: 'Pesan berhasil dikirim',
      data: {
        id: result?.id?._serialized || null,
        target: normalizedTarget,
        timestamp: result?.timestamp || null,
        type: result?.type || (media ? 'media' : 'chat'),
      },
    });
  } catch (error) {
    return next(error);
  }
}

router.post('/send', sendMessage);

module.exports = { messagesRouter: router, sendMessage };
