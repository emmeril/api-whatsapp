const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhoneNumber, toWhatsAppId } = require('../src/utils/phone');

test('mengubah nomor Indonesia berawalan nol', () => {
  assert.equal(normalizePhoneNumber('0812-3456-7890', '62'), '6281234567890');
});

test('mempertahankan nomor dengan kode negara', () => {
  assert.equal(normalizePhoneNumber('+62 812 3456 7890', '62'), '6281234567890');
});

test('mengubah prefiks internasional 00', () => {
  assert.equal(normalizePhoneNumber('006281234567890', '62'), '6281234567890');
});

test('membuat WhatsApp ID', () => {
  assert.equal(toWhatsAppId('081234567890', '62'), '6281234567890@c.us');
});

test('menolak nomor terlalu pendek', () => {
  assert.throws(() => normalizePhoneNumber('123'), /8 sampai 15 digit/);
});
