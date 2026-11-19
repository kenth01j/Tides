const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateAdditionalDiverNames,
  validateAdditionalDiverLicenses,
  validateDiverLicenseNumber
} = require('../utils/diverNames');

test('single diver booking accepts an omitted additional-name list', () => {
  assert.deepEqual(validateAdditionalDiverNames(undefined, 1), { valid: true, names: [] });
});

test('group booking requires exactly one name for each additional diver', () => {
  assert.deepEqual(validateAdditionalDiverNames(['  Alex Diver  ', 'Sam Diver'], 3), {
    valid: true,
    names: ['Alex Diver', 'Sam Diver']
  });
  assert.equal(validateAdditionalDiverNames(['Alex Diver'], 3).valid, false);
  assert.equal(validateAdditionalDiverNames(['Alex Diver', 'Sam Diver', 'Extra Diver'], 3).valid, false);
});

test('additional diver names must be non-empty strings of at most 100 characters', () => {
  assert.equal(validateAdditionalDiverNames([' '], 2).valid, false);
  assert.equal(validateAdditionalDiverNames(['x'.repeat(101)], 2).valid, false);
  assert.equal(validateAdditionalDiverNames([2], 2).valid, false);
});

test('diver count must remain within the supported range', () => {
  assert.equal(validateAdditionalDiverNames([], 0).valid, false);
  assert.equal(validateAdditionalDiverNames([], 501).valid, false);
});

test('group booking requires one scuba license number for each additional diver', () => {
  assert.deepEqual(validateAdditionalDiverLicenses(['  CERT-123  ', 'CERT-456'], 3), {
    valid: true,
    licenses: ['CERT-123', 'CERT-456']
  });
  assert.equal(validateAdditionalDiverLicenses(['CERT-123'], 3).valid, false);
  assert.equal(validateAdditionalDiverLicenses([], 2).valid, false);
});

test('group license mode requires no additional diver license numbers', () => {
  assert.deepEqual(validateAdditionalDiverLicenses([], 3, 'group'), {
    valid: true,
    licenses: []
  });
  assert.deepEqual(validateAdditionalDiverLicenses(undefined, 3, 'group'), {
    valid: true,
    licenses: []
  });
  assert.equal(validateAdditionalDiverLicenses(['CERT-123'], 3, 'group').valid, false);
});

test('scuba license numbers must be non-empty strings of at most 60 characters', () => {
  assert.equal(validateAdditionalDiverLicenses([' '], 2).valid, false);
  assert.equal(validateAdditionalDiverLicenses(['x'.repeat(61)], 2).valid, false);
  assert.equal(validateAdditionalDiverLicenses([2], 2).valid, false);
  assert.deepEqual(validateAdditionalDiverLicenses(undefined, 1), { valid: true, licenses: [] });
});

test('individual license mode still requires a license for each additional diver', () => {
  assert.equal(validateAdditionalDiverLicenses(['CERT-123', 'CERT-456'], 3, 'individual').valid, true);
  assert.equal(validateAdditionalDiverLicenses(['CERT-123'], 3, 'individual').valid, false);
});

test('lead diver scuba license number is required and trimmed', () => {
  assert.deepEqual(validateDiverLicenseNumber('  CERT-LEAD-123  '), {
    valid: true,
    licenseNumber: 'CERT-LEAD-123'
  });
  assert.equal(validateDiverLicenseNumber(undefined).valid, false);
  assert.equal(validateDiverLicenseNumber(' ').valid, false);
  assert.equal(validateDiverLicenseNumber('x'.repeat(61)).valid, false);
});
