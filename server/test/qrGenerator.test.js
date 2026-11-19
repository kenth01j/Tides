const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'a-test-secret-long-enough-for-qr-permit-tests';
const { createPermit, getPermitDetails, verifyPermit, verifyReceiptToken } = require('../utils/qrGenerator');

test('approved permit QR values are signed public receipt links', async () => {
  const permit = await createPermit('TDS-TEST-123', 'https://tides.example');
  assert.match(permit.value, /^https:\/\/tides\.example\/confirmation\.html\?/);
  assert.match(permit.image, /^data:image\/png;base64,/);
  assert.equal(getPermitDetails(permit.value).bookingId, 'TDS-TEST-123');
  assert.equal(verifyPermit(permit.value, 'TDS-TEST-123'), true);
  assert.equal(verifyPermit(permit.value, 'TDS-OTHER'), false);
  assert.equal(verifyReceiptToken('TDS-TEST-123', new URLSearchParams(new URL(permit.value).hash.slice(1)).get('token')), true);
});

test('permit verification rejects modified and malformed receipt tokens', async () => {
  const permit = await createPermit('TDS-TEST-456', 'https://tides.example');
  const url = new URL(permit.value);
  url.hash = new URLSearchParams({ token: '0'.repeat(64) }).toString();
  assert.equal(verifyPermit(url.toString(), 'TDS-TEST-456'), false);
  assert.equal(verifyPermit('not a permit', 'TDS-TEST-456'), false);
  assert.equal(verifyReceiptToken('TDS-TEST-456', undefined), false);
});
