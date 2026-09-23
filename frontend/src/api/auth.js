/**
 * src/api/auth.js
 *
 * Authentication API module communicating with the PostgreSQL backend.
 */

import { apiClient, refreshTokenSingleFlight } from './client.js';

export const authApi = {
  /**
   * Exchanges a verified Firebase ID token for PostgreSQL JWT + HttpOnly refresh cookie.
   * Optionally transmits plaintext password for JIT migration of locked accounts (FRONTEND.D5).
   * @param {Object} params
   * @param {string} params.idToken - Raw Firebase ID token (JWT)
   * @param {string} [params.password] - Plaintext password for JIT password hash upgrade
   * @returns {Promise<{ success: boolean, data: { accessToken: string, user: Object } }>}
   */
  async firebaseExchange({ idToken, password }) {
    const payload = { idToken };
    if (password) {
      payload.password = password;
    }
    return apiClient('/api/v1/auth/firebase-exchange', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Authenticates a parent user via student admission number and school code.
   * @param {Object} params
   * @param {string} params.schoolCode - School unique code (e.g. 'SchoolS024')
   * @param {string} params.admissionNumber - Student admission number
   * @param {string} params.password - Parent password
   * @returns {Promise<{ success: boolean, data: { accessToken: string, user: Object } }>}
   */
  async admissionLogin({ schoolCode, admissionNumber, password }) {
    return apiClient('/api/v1/auth/admission-login', {
      method: 'POST',
      body: JSON.stringify({ schoolCode, admissionNumber, password })
    });
  },

  /**
   * Primary email + password authentication (used in future native mode).
   * @param {Object} params
   * @param {string} params.identifier - Email
   * @param {string} params.password - Password
   * @returns {Promise<{ success: boolean, data: { accessToken: string, user: Object } }>}
   */
  async login({ identifier, password }) {
    return apiClient('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
  },

  /**
   * Rotates refresh token via HttpOnly cookie and returns a new access JWT.
   * Deduplicated via single-flight refresh queue to avoid parallel rotation calls.
   * @returns {Promise<{ success: boolean, data: { accessToken: string, user: Object } }>}
   */
  async refreshSession() {
    return apiClient('/api/v1/auth/refresh', {
      method: 'POST'
    });
  },

  /**
   * Revokes the current refresh session and logs out.
   * @returns {Promise<{ success: boolean }>}
   */
  async logout() {
    return apiClient('/api/v1/auth/logout', {
      method: 'POST'
    });
  },

  /**
   * Revokes all active refresh sessions for the current user.
   * @returns {Promise<{ success: boolean }>}
   */
  async logoutAll() {
    return apiClient('/api/v1/auth/logout-all', {
      method: 'POST'
    });
  },

  /**
   * Retrieves the current authenticated user's profile and tenant scope.
   * @returns {Promise<{ success: boolean, data: { user: Object } }>}
   */
  async getMe() {
    return apiClient('/api/v1/auth/me', {
      method: 'GET'
    });
  },

  /**
   * Requests a password reset link.
   * @param {Object} params
   * @param {string} params.email - User email
   * @returns {Promise<{ success: boolean }>}
   */
  async passwordResetRequest({ email }) {
    return apiClient('/api/v1/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  /**
   * Confirms password reset with token.
   * @param {Object} params
   * @param {string} params.token - Reset token
   * @param {string} params.newPassword - New password
   * @returns {Promise<{ success: boolean }>}
   */
  async passwordResetConfirm({ token, newPassword }) {
    return apiClient('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });
  },

  /**
   * Confirms first-time password setup for a locked account using a setup token.
   * @param {Object} params
   * @param {string} params.token - Setup token
   * @param {string} params.newPassword - New password
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async passwordSetupConfirm({ token, newPassword }) {
    return apiClient('/api/v1/auth/password-setup/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });
  }
};

export default authApi;
