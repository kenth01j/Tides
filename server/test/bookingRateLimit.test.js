const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

test('availability checks and rejected submissions do not exhaust booking limits', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (let index = 0; index < 25; index += 1) {
    const response = await fetch(`${baseUrl}/api/bookings/availability?date=invalid`);
    assert.equal(response.status, 400);
  }

  for (let index = 0; index < 25; index += 1) {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 401);
  }
});
