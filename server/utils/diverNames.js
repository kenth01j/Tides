function validateAdditionalDiverNames(names, numDivers) {
  const expectedCount = Number(numDivers) - 1;
  if (!Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount > 499) {
    return { valid: false, names: [], message: 'Number of divers must be between 1 and 500.' };
  }

  const submittedNames = names === undefined && expectedCount === 0 ? [] : names;
  if (!Array.isArray(submittedNames) || submittedNames.length !== expectedCount) {
    return {
      valid: false,
      names: [],
      message: `Enter the full name of each of the ${expectedCount} additional diver${expectedCount === 1 ? '' : 's'}.`
    };
  }

  const normalizedNames = submittedNames.map(name => typeof name === 'string' ? name.trim() : '');
  if (normalizedNames.some(name => name.length < 2 || name.length > 100)) {
    return {
      valid: false,
      names: [],
      message: 'Each diver name must be 2–100 characters.'
    };
  }

  return { valid: true, names: normalizedNames };
}

function validateAdditionalDiverLicenses(licenses, numDivers, licenseMode = 'individual') {
  if (!['group', 'individual'].includes(licenseMode)) {
    return {
      valid: false,
      licenses: [],
      message: 'Choose group or individual scuba licenses.'
    };
  }
  const expectedCount = Number(numDivers) - 1;
  if (!Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount > 499) {
    return { valid: false, licenses: [], message: 'Number of divers must be between 1 and 500.' };
  }
  const requiredCount = licenseMode === 'group' ? 0 : expectedCount;

  const submittedLicenses = licenses === undefined && requiredCount === 0 ? [] : licenses;
  if (!Array.isArray(submittedLicenses) || submittedLicenses.length !== requiredCount) {
    return {
      valid: false,
      licenses: [],
      message: licenseMode === 'group'
        ? 'Do not provide individual scuba licenses when the group license option is selected.'
        : `Enter a scuba license number for each of the ${expectedCount} additional diver${expectedCount === 1 ? '' : 's'}.`
    };
  }

  const normalizedLicenses = submittedLicenses.map(license => typeof license === 'string' ? license.trim() : '');
  if (normalizedLicenses.some(license => license.length < 2 || license.length > 60)) {
    return {
      valid: false,
      licenses: [],
      message: 'Each scuba license number must be 2–60 characters.'
    };
  }

  return { valid: true, licenses: normalizedLicenses };
}

function validateDiverLicenseNumber(licenseNumber) {
  const normalizedLicenseNumber = typeof licenseNumber === 'string' ? licenseNumber.trim() : '';
  if (normalizedLicenseNumber.length < 2 || normalizedLicenseNumber.length > 60) {
    return {
      valid: false,
      licenseNumber: '',
      message: 'Scuba license number must be 2–60 characters.'
    };
  }
  return { valid: true, licenseNumber: normalizedLicenseNumber };
}

module.exports = {
  validateAdditionalDiverNames,
  validateAdditionalDiverLicenses,
  validateDiverLicenseNumber
};
