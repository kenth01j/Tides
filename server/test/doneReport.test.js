const test = require('node:test');
const assert = require('node:assert/strict');
const { getDoneReportRange } = require('../utils/doneReport');

test('daily report selects only the chosen valid date', () => {
  assert.deepEqual(getDoneReportRange('daily', { date: '2026-02-28' }, '2026-11-01'), {
    from: '2026-02-28',
    through: '2026-02-28'
  });
  assert.throws(() => getDoneReportRange('daily', { date: '2026-02-30' }, '2026-11-01'), /valid visit date/);
});

test('monthly report includes the final day of leap-year February', () => {
  assert.deepEqual(getDoneReportRange('monthly', { month: '2024-02' }, '2026-11-01'), {
    from: '2024-02-01',
    through: '2024-02-29'
  });
});

test('yearly report uses calendar-year boundaries', () => {
  assert.deepEqual(getDoneReportRange('yearly', { year: '2025' }, '2026-11-01'), {
    from: '2025-01-01',
    through: '2025-12-31'
  });
});

test('rolling year range clamps leap day to the prior year month end', () => {
  assert.deepEqual(getDoneReportRange('1-year', {}, '2024-02-29'), {
    from: '2023-02-28',
    through: '2024-02-29'
  });
  assert.deepEqual(getDoneReportRange('3-year', {}, '2026-11-01'), {
    from: '2023-11-01',
    through: '2026-11-01'
  });
});

test('unknown periods and invalid months are rejected', () => {
  assert.throws(() => getDoneReportRange('4-year', {}, '2026-11-01'), /valid reporting period/);
  assert.throws(() => getDoneReportRange('monthly', { month: '0999-12' }, '2026-11-01'), /valid month/);
});
