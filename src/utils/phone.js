// src/utils/phone.js
const crypto = require('crypto');

function hashPhone(phone) {
  const salt = process.env.PHONE_SALT_SECRET || '';
  return crypto.createHash('sha256').update(phone + salt).digest('hex');
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('961') && digits.length >= 11) {
    const last4 = digits.slice(-4);
    return `+961 XX XX ${last4.slice(0, 2)} ${last4.slice(2)}`;
  }
  const last4 = digits.slice(-4);
  return '*'.repeat(Math.max(0, digits.length - 4)) + last4;
}

function sanitizeLogs(text) {
  // Match international phone numbers
  return text.replace(/\+?\d[\d\s-]{7,14}\d/g, '[PHONE]');
}

module.exports = { hashPhone, maskPhone, sanitizeLogs };
