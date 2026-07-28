const crypto = require('node:crypto');

const { config } = require('../config');

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');

  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function apiAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const token = bearerToken || req.get('token') || req.get('x-api-key') || '';

  if (!safeEqual(token, config.apiToken)) {
    return res.status(401).json({
      status: false,
      error: 'UNAUTHORIZED',
      message: 'Token API tidak valid',
    });
  }

  return next();
}

module.exports = { apiAuth };
