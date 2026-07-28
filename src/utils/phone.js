function normalizePhoneNumber(value, countryCode = '62') {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError('target harus berupa nomor telepon');
  }

  let number = String(value).trim().replace(/[^\d]/g, '');

  if (!number) {
    throw new TypeError('target tidak boleh kosong');
  }

  if (number.startsWith('00')) {
    number = number.slice(2);
  } else if (number.startsWith('0')) {
    number = `${countryCode}${number.slice(1)}`;
  }

  if (number.length < 8 || number.length > 15) {
    throw new TypeError('target harus berisi 8 sampai 15 digit');
  }

  return number;
}

function toWhatsAppId(value, countryCode) {
  return `${normalizePhoneNumber(value, countryCode)}@c.us`;
}

module.exports = { normalizePhoneNumber, toWhatsAppId };
