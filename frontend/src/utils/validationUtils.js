/**
 * Validation utilities for user input and entity attributes.
 */

/**
 * Validates a person's name (e.g. First Name, Last Name).
 * 
 * Rules:
 * 1. Must not be empty after trimming.
 * 2. Must not contain digits (takes precedence over special character checks).
 * 3. Must contain at least one Unicode letter.
 * 4. Only letters (including international/accented), spaces, hyphens, apostrophes, and periods are allowed.
 * 
 * @param {string} name - The name string to validate.
 * @param {string} fieldLabel - Display label for error messages (e.g. 'First name', 'Last name').
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateName = (name, fieldLabel = 'Name') => {
  if (!name || !name.trim()) {
    return `${fieldLabel} is required`;
  }
  const trimmed = name.trim();
  if (/\d/.test(trimmed)) {
    return `${fieldLabel} cannot contain numbers`;
  }
  if (!/\p{L}/u.test(trimmed) || !/^[\p{L}\p{M}\s'.-]+$/u.test(trimmed)) {
    return `${fieldLabel} can only contain letters, spaces, hyphens, apostrophes, and periods`;
  }
  return null;
};

/**
 * Returns today's calendar date in local time formatted as YYYY-MM-DD.
 * 
 * @returns {string} Today's date string in YYYY-MM-DD format.
 */
export const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Validates a Date of Birth value (YYYY-MM-DD).
 * 
 * Rules:
 * 1. Checks required/empty value.
 * 2. Validates YYYY-MM-DD structure and calendar integrity (rejects rollover dates like 2026-02-31).
 * 3. Compares calendar date string against today's local date (rejects future dates).
 * 
 * @param {string|Date} dob - The date of birth to validate.
 * @param {boolean} [isRequired=true] - Whether DOB is required.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateDateOfBirth = (dob, isRequired = true) => {
  if (!dob || (typeof dob === 'string' && !dob.trim())) {
    return isRequired ? 'Date of birth is required' : null;
  }

  let dobString = '';
  if (typeof dob === 'string') {
    const trimmed = dob.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return 'Please enter a valid date';
    }
    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) {
      return 'Please enter a valid date';
    }
    dobString = trimmed;
  } else if (dob instanceof Date) {
    if (isNaN(dob.getTime())) return 'Please enter a valid date';
    const year = dob.getFullYear();
    const month = String(dob.getMonth() + 1).padStart(2, '0');
    const day = String(dob.getDate()).padStart(2, '0');
    dobString = `${year}-${month}-${day}`;
  } else {
    return 'Please enter a valid date';
  }

  const todayString = getTodayDateString();
  if (dobString > todayString) {
    return 'Date of birth cannot be in the future';
  }

  return null;
};

/**
 * Canonical list of accepted Blood Groups.
 */
export const VALID_BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
];

/**
 * Validates a Blood Group value.
 * 
 * Rules:
 * 1. Empty/whitespace: returns null if optional (!isRequired), or 'Blood group is required' if isRequired.
 * 2. Normalizes input: bloodGroup.toString().trim().toUpperCase().
 * 3. Checks exact membership in VALID_BLOOD_GROUPS.
 * 4. Invalid values: returns 'Please select a valid blood group'.
 * 5. Valid values: returns null.
 * 
 * @param {string} bloodGroup - The blood group to validate.
 * @param {boolean} [isRequired=false] - Whether blood group is required.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateBloodGroup = (bloodGroup, isRequired = false) => {
  if (bloodGroup === null || bloodGroup === undefined || (typeof bloodGroup === 'string' && !bloodGroup.trim())) {
    return isRequired ? 'Blood group is required' : null;
  }

  const normalized = bloodGroup.toString().trim().toUpperCase();
  if (!VALID_BLOOD_GROUPS.includes(normalized)) {
    return 'Please select a valid blood group';
  }

  return null;
};

/**
 * Validates an Aadhaar number.
 * 
 * Rules:
 * 1. Checks required/empty value. If optional and empty/whitespace/null/undefined, returns null (valid).
 * 2. If required and empty/whitespace, returns 'Aadhaar number is required'.
 * 3. Operates purely on string to avoid precision loss / coercion issues.
 * 4. Checks that it contains exactly 12 numeric ASCII digits (0-9) without spaces, letters, or symbols.
 * 5. Returns 'Aadhaar number must be 12 digits' if invalid.
 * 
 * @param {string} aadhaarNumber - The Aadhaar number to validate.
 * @param {boolean} [isRequired=false] - Whether Aadhaar number is required.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateAadhaarNumber = (aadhaarNumber, isRequired = false) => {
  if (aadhaarNumber === null || aadhaarNumber === undefined || (typeof aadhaarNumber === 'string' && !aadhaarNumber.trim())) {
    return isRequired ? 'Aadhaar number is required' : null;
  }

  if (typeof aadhaarNumber !== 'string') {
    return 'Aadhaar number must be 12 digits';
  }

  const trimmed = aadhaarNumber.trim();
  // Must be exactly 12 numeric digits (0-9)
  if (!/^[0-9]{12}$/.test(trimmed)) {
    return 'Aadhaar number must be 12 digits';
  }

  return null;
};

/**
 * Validates a 10-digit phone number.
 * 
 * Rules:
 * 1. Empty/whitespace: returns null if optional (!isRequired), or `${fieldLabel} is required` if isRequired.
 * 2. If non-empty, checks that it contains exactly 10 digits (ASCII 0-9).
 * 
 * @param {string} phone - The phone number to validate.
 * @param {boolean} [isRequired=false] - Whether phone is required.
 * @param {string} [fieldLabel='Mobile number'] - Display label for required error message.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validatePhone = (phone, isRequired = false, fieldLabel = 'Mobile number') => {
  if (phone === null || phone === undefined || (typeof phone === 'string' && !phone.trim())) {
    return isRequired ? `${fieldLabel} is required` : null;
  }

  if (typeof phone !== 'string') {
    return 'Mobile number must be 10 digits';
  }

  const trimmed = phone.trim();
  if (!/^[0-9]{10}$/.test(trimmed)) {
    return 'Mobile number must be 10 digits';
  }

  return null;
};

/**
 * Validates an email address format.
 * 
 * Rules:
 * 1. Empty/whitespace: returns null if optional (!isRequired), or `${fieldLabel} is required` if isRequired.
 * 2. If non-empty, validates standard email format (user@domain.tld).
 * 
 * @param {string} email - The email to validate.
 * @param {boolean} [isRequired=false] - Whether email is required.
 * @param {string} [fieldLabel='Email'] - Display label for required error message.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateEmail = (email, isRequired = false, fieldLabel = 'Email') => {
  if (email === null || email === undefined || (typeof email === 'string' && !email.trim())) {
    return isRequired ? `${fieldLabel} is required` : null;
  }

  if (typeof email !== 'string') {
    return 'Invalid email format';
  }

  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Invalid email format';
  }

  return null;
};

/**
 * Canonical regular expression for supported vehicle registration number format.
 * Matches standard format with hyphens demonstrated by project evidence:
 * 2 letters - 2 digits - 2 letters - 4 digits (e.g. MH-12-PQ-4567).
 */
export const VEHICLE_REGISTRATION_REGEX = /^[A-Z]{2}-[0-9]{2}-[A-Z]{2}-[0-9]{4}$/;

/**
 * Validates a vehicle registration number.
 * 
 * Rules:
 * 1. Checks required/empty value: returns 'Registration number is required' if isRequired and empty.
 * 2. Normalizes input by trimming and converting to uppercase.
 * 3. Enforces the project-supported format: 2 letters - 2 digits - 2 letters - 4 digits (e.g. MH-12-PQ-4567).
 * 4. Rejects formats without project evidence (unseparated, spaces, missing series letters, Bharat series).
 * 5. Returns 'Please enter a valid vehicle registration number (e.g. MH-12-PQ-4567)' if invalid.
 * 
 * @param {string} registrationNumber - The vehicle registration number to validate.
 * @param {boolean} [isRequired=true] - Whether registration number is required.
 * @returns {string|null} Error message if invalid, or null if valid.
 */
export const validateVehicleRegistrationNumber = (registrationNumber, isRequired = true) => {
  if (registrationNumber === null || registrationNumber === undefined || (typeof registrationNumber === 'string' && !registrationNumber.trim())) {
    return isRequired ? 'Registration number is required' : null;
  }

  if (typeof registrationNumber !== 'string') {
    return 'Please enter a valid vehicle registration number (e.g. MH-12-PQ-4567)';
  }

  const normalized = registrationNumber.trim().toUpperCase();
  if (!VEHICLE_REGISTRATION_REGEX.test(normalized)) {
    return 'Please enter a valid vehicle registration number (e.g. MH-12-PQ-4567)';
  }

  return null;
};

