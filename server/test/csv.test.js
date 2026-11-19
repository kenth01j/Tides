const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, csvDocument } = require('../utils/csv');

test('CSV cells quote delimiters and escape embedded quotes', () => {
  assert.equal(csvCell('Santos, "Ava"'), '"Santos, ""Ava"""');
});

test('CSV cells neutralize spreadsheet formulas', () => {
  assert.equal(csvCell('=1+1'), "\"'=1+1\"");
  assert.equal(csvCell('-10'), "\"'-10\"");
});

test('CSV documents include a UTF-8 BOM and CRLF rows', () => {
  assert.equal(csvDocument([['Name', 'Value'], ['Ava', 300]]), '\uFEFF"Name","Value"\r\n"Ava","300"');
});
