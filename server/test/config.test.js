const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { getConfig } = require('../config');

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/tides',
  JWT_SECRET: 'a-test-secret-long-enough-to-satisfy-config-validation',
  TRUST_PROXY: 'loopback'
};

test('configuration parses local runtime settings and proof storage directory', () => {
  const config = getConfig({
    ...validEnv,
    PAYMENT_PROOF_DIR: 'data/payment-proofs'
  }, 'C:\\tides');

  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 3000);
  assert.equal(config.mongoUri, validEnv.MONGODB_URI);
  assert.equal(config.trustProxy, 'loopback');
  assert.equal(config.paymentProofDir, path.resolve('C:\\tides', 'data/payment-proofs'));
});

test('configuration rejects missing secrets and invalid ports', () => {
  assert.throws(() => getConfig({ ...validEnv, JWT_SECRET: '' }), /JWT_SECRET is required/);
  assert.throws(() => getConfig({ ...validEnv, PORT: '70000' }), /PORT must be an integer/);
  assert.throws(() => getConfig({ ...validEnv, MONGODB_URI: 'https://db.example' }), /MONGODB_URI must be a valid/);
});

test('production requires a public HTTPS origin', () => {
  assert.throws(() => getConfig({ ...validEnv, NODE_ENV: 'production' }), /PUBLIC_BASE_URL must be set/);
  const config = getConfig({
    ...validEnv,
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://tides.example.gov.ph'
  });
  assert.equal(config.publicBaseUrl, 'https://tides.example.gov.ph');
});
