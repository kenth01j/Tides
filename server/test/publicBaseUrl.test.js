const test = require('node:test');
const assert = require('node:assert/strict');
const publicBaseUrl = require('../utils/publicBaseUrl');

test('public receipt links use the forwarded host and protocol', () => {
  const original = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  const req = {
    protocol: 'http',
    get(name) {
      return {
        'x-forwarded-host': 'tides.example, internal.example',
        'x-forwarded-proto': 'https, http',
        host: 'localhost:3001'
      }[name];
    }
  };
  try {
    assert.equal(publicBaseUrl(req), 'https://tides.example');
  } finally {
    if (original === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = original;
  }
});

test('configured public base URL takes precedence over forwarded headers', () => {
  const original = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://public.tides.example';
  try {
    assert.equal(publicBaseUrl({ get: () => 'localhost:3001', protocol: 'http' }), 'https://public.tides.example');
  } finally {
    if (original === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = original;
  }
});
