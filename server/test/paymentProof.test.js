const test = require('node:test');
const assert = require('node:assert/strict');
const { imageType } = require('../utils/paymentProof');

test('payment proof accepts JPEG, PNG, and WebP signatures only', () => {
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(imageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageType(Buffer.from('RIFF0000WEBP', 'ascii')), 'image/webp');
  assert.equal(imageType(Buffer.from('<svg></svg>')), null);
});
