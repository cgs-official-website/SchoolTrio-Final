/**
 * Authoritative regular expression constants for School Management System.
 * Reconciled against src/utils/validationUtils.js and validated in Phase 1A.2.
 */

// Indian Vehicle Registration format: 2 letters - 2 digits - 2 letters - 4 digits (e.g. MH-12-PQ-4567)
export const VEHICLE_REGISTRATION_REGEX = /^[A-Z]{2}-[0-9]{2}-[A-Z]{2}-[0-9]{4}$/;

// 12-digit Indian Aadhaar Number
export const AADHAAR_REGEX = /^[0-9]{12}$/;

// 10-digit Mobile Phone Number
export const PHONE_REGEX = /^[0-9]{10}$/;

// Calendar Date in YYYY-MM-DD format
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Name regex: Unicode letters, spaces, hyphens, apostrophes, periods
export const NAME_REGEX = /^[\p{L}\p{M}\s'.-]+$/u;

// Standard Accepted Clinical Blood Groups
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
