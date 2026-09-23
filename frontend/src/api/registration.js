/**
 * src/api/registration.js
 *
 * Public Registration REST API client module communicating with the PostgreSQL backend.
 * Provides unauthenticated self-registration and activation endpoints for:
 * - Schools (POST /api/v1/public/schools/register)
 * - Teachers / Staff (POST /api/v1/public/teachers/register)
 * - Parents (POST /api/v1/public/parents/register)
 */

import { apiClient } from './client.js';

/**
 * Registers a new school tenant and administrative account.
 * Calls POST /api/v1/public/schools/register.
 *
 * @param {Object} payload
 * @param {string} payload.name - School official name
 * @param {string} payload.code - Unique uppercase school code
 * @param {string} [payload.type] - School type (e.g. 'School', 'Academy', 'College')
 * @param {string} [payload.email] - Official school contact email
 * @param {string} [payload.phone] - Official school contact phone
 * @param {string} [payload.address] - Physical campus address
 * @param {string} [payload.planId] - Subscription plan UUID
 * @param {number} [payload.seatLimit] - Student seat limit
 * @param {number} [payload.teacherLimit] - Teacher limit
 * @param {Object} payload.admin
 * @param {string} payload.admin.name - Administrator full name
 * @param {string} payload.admin.email - Administrator login email
 * @param {string} payload.admin.password - Administrator plaintext password
 * @param {string} [payload.admin.phone] - Administrator phone number
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function registerSchool(payload) {
  return apiClient('/api/v1/public/schools/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Activates an invited teacher/staff account.
 * Calls POST /api/v1/public/teachers/register.
 *
 * @param {Object} payload
 * @param {string} payload.schoolId - School UUID
 * @param {string} payload.email - Teacher official email
 * @param {string} payload.password - Teacher plaintext password
 * @param {string} [payload.employeeId] - Staff employee / reference ID
 * @param {string} [payload.name] - Teacher full name
 * @param {string} [payload.phone] - Teacher phone number
 * @param {Object} [payload.customData] - Additional custom form metadata
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function registerTeacher(payload) {
  return apiClient('/api/v1/public/teachers/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Registers a parent account and links them to an enrolled student.
 * Calls POST /api/v1/public/parents/register.
 *
 * @param {Object} payload
 * @param {string} payload.schoolId - School UUID
 * @param {string} payload.name - Parent full name
 * @param {string} payload.email - Parent login email
 * @param {string} payload.password - Parent plaintext password
 * @param {string} [payload.phone] - Parent phone number
 * @param {string} payload.admissionNumber - Student official admission number
 * @param {string} payload.dob - Student date of birth in YYYY-MM-DD format
 * @param {string} payload.relationship - Relationship to student (e.g. 'Father', 'Mother', 'Guardian')
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function registerParent(payload) {
  return apiClient('/api/v1/public/parents/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export const registrationApi = {
  registerSchool,
  registerTeacher,
  registerParent
};

export default registrationApi;
