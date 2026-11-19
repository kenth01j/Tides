// Proposal objective: generate QR permits bound to a booking and tamper-evident verification hash.
const crypto = require('crypto');
const QRCode = require('qrcode');

function verificationHash(bookingId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(bookingId).digest('hex');
}

function verifyReceiptToken(bookingId, token) {
  if (typeof bookingId !== 'string' || typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) return false;
  const expected = Buffer.from(verificationHash(bookingId), 'hex');
  const supplied = Buffer.from(token, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function getPermitDetails(value) {
  try {
    const payload = JSON.parse(value);
    if (payload && typeof payload.bookingId === 'string' && typeof payload.verificationHash === 'string') {
      return { bookingId: payload.bookingId, token: payload.verificationHash };
    }
  } catch {
    // QR permits may be legacy JSON or a link to the public receipt.
  }

  try {
    const url = new URL(value, 'http://localhost');
    if (url.pathname !== '/confirmation.html') return null;
    return {
      bookingId: url.searchParams.get('bookingId'),
      token: new URLSearchParams(url.hash.slice(1)).get('token') || url.searchParams.get('token')
    };
  } catch {
    return null;
  }
}

async function createPermit(bookingId, baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000') {
  const url = new URL('/confirmation.html', baseUrl);
  url.searchParams.set('bookingId', bookingId);
  url.hash = new URLSearchParams({ token: verificationHash(bookingId) }).toString();
  const value = url.toString();
  return { value, image: await QRCode.toDataURL(value, { errorCorrectionLevel: 'H', margin: 2, width: 320 }) };
}

function verifyPermit(value, expectedBookingId) {
  const details = getPermitDetails(value);
  return Boolean(details && details.bookingId === expectedBookingId &&
    verifyReceiptToken(expectedBookingId, details.token));
}

module.exports = { createPermit, getPermitDetails, verifyPermit, verifyReceiptToken };
