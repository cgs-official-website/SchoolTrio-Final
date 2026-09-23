import { env } from '../../config/env.js';
import { AUTH_CONSTANTS, ERROR_CODES } from '../../config/constants.js';
import { ApiResponse } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/app-error.js';
import * as authService from './auth.service.js';
import * as passwordResetService from './password-reset.service.js';
import { verifyAccessToken } from './token.service.js';

/**
 * Cookie Extraction and Security Configuration Helpers
 */

/**
 * Parses cookies from request headers safely without third-party dependencies.
 *
 * @param {import('express').Request} req - Express request
 * @returns {Record<string, string>} Key-value cookie pairs
 */
export const parseCookies = (req) => {
  if (req.cookies && typeof req.cookies === 'object') {
    return req.cookies;
  }
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, ...val] = cookie.trim().split('=');
    if (key) {
      acc[key] = decodeURIComponent(val.join('='));
    }
    return acc;
  }, {});
};

/**
 * Returns standardized options for the HttpOnly refresh cookie.
 *
 * @returns {import('express').CookieOptions} Cookie configuration
 */
export const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'Strict',
  maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  path: AUTH_CONSTANTS.REFRESH_COOKIE_PATH || '/api/v1/auth'
});

/**
 * Returns standardized options for clearing the refresh cookie (omits maxAge to satisfy Express 4/5).
 *
 * @returns {import('express').CookieOptions} Cookie configuration
 */
export const getClearRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'Strict',
  path: AUTH_CONSTANTS.REFRESH_COOKIE_PATH || '/api/v1/auth'
});

/**
 * Resolves the authenticated user ID from req.user or directly verifies Bearer access token.
 *
 * @param {import('express').Request} req - Express request
 * @returns {string} Subject user UUID
 * @throws {UnauthorizedError} If request is unauthenticated or token is invalid
 */
const resolveUserId = (req) => {
  if (req.auth?.userId) {
    return req.auth.userId;
  }
  if (req.user && (req.user.id || req.user.sub)) {
    return req.user.id || req.user.sub;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required: missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);
  return decoded.sub;
};

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials and issues access token + refresh cookie.
 */
export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const deviceInfo = req.headers['user-agent'] || null;

    const { accessToken, rawRefreshToken, user } = await authService.login({
      identifier,
      password,
      ipAddress,
      deviceInfo
    });

    // Set refresh token solely in HttpOnly cookie
    res.cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, rawRefreshToken, getRefreshCookieOptions());

    return ApiResponse.success(
      res,
      {
        accessToken,
        user
      },
      'Login successful'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/admission-login
 * Authenticates parent via student admission number and school code.
 */
export const admissionLogin = async (req, res, next) => {
  try {
    const { schoolCode, admissionNumber, password } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const deviceInfo = req.headers['user-agent'] || null;

    const { accessToken, rawRefreshToken, user } = await authService.authenticateByAdmissionNumber({
      schoolCode,
      admissionNumber,
      password,
      ipAddress,
      deviceInfo
    });

    // Set refresh token solely in HttpOnly cookie
    res.cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, rawRefreshToken, getRefreshCookieOptions());

    return ApiResponse.success(
      res,
      {
        accessToken,
        user
      },
      'Admission login successful'
    );
  } catch (err) {
    next(err);
  }
};


/**
 * POST /api/v1/auth/refresh
 * Rotates the refresh session from HttpOnly cookie and issues a new access token.
 */
export const refresh = async (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const rawRefreshToken = cookies[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];

    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token cookie is required', ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const deviceInfo = req.headers['user-agent'] || null;

    const { accessToken, newRawRefreshToken, user } = await authService.refresh({
      rawRefreshToken,
      ipAddress,
      deviceInfo
    });

    // Rotate HttpOnly cookie if new raw token was issued
    if (newRawRefreshToken) {
      res.cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, newRawRefreshToken, getRefreshCookieOptions());
    }

    return ApiResponse.success(
      res,
      {
        accessToken,
        user
      },
      'Token refreshed successfully'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 * Revokes active refresh session and clears HttpOnly refresh cookie.
 */
export const logout = async (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const rawRefreshToken = cookies[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];

    if (rawRefreshToken) {
      await authService.logout({ rawRefreshToken });
    }

    // Always clear the cookie
    res.clearCookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    return ApiResponse.success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout-all
 * Revokes all active refresh sessions for authenticated user and clears cookie.
 */
export const logoutAll = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);

    await authService.logoutAll({ userId });

    res.clearCookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    return ApiResponse.success(res, null, 'All sessions successfully terminated');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/me
 * Retrieves profile details of the authenticated user.
 */
export const me = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const userData = await authService.getCurrentUser({ userId });

    return ApiResponse.success(res, userData);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/password-reset/request
 * Public: Request a password reset link sent to registered email.
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await passwordResetService.requestPasswordReset({
      email,
      ipAddress
    });

    return ApiResponse.success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/password-reset/confirm
 * Public: Confirm password reset with a valid token.
 */
export const confirmPasswordReset = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await passwordResetService.confirmPasswordReset({
      token,
      newPassword,
      ipAddress
    });

    return ApiResponse.success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/password-setup/confirm
 * Public: Confirm first-time password setup for a locked account.
 */
export const confirmPasswordSetup = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await passwordResetService.confirmPasswordSetup({
      token,
      newPassword,
      ipAddress
    });

    return ApiResponse.success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/change-password
 * Authenticated: Change password for currently authenticated user.
 */
export const changePassword = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const { currentPassword, newPassword } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await passwordResetService.changePassword({
      userId,
      currentPassword,
      newPassword,
      ipAddress
    });

    // Clear refresh token cookie on caller
    res.clearCookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    return ApiResponse.success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/firebase-exchange
 * Public (Token-based): Exchanges verified Firebase ID token for PostgreSQL JWT + refresh cookie.
 */
export const firebaseExchange = async (req, res, next) => {
  try {
    const { idToken, password = null } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const deviceInfo = req.headers['user-agent'] || null;

    const { accessToken, rawRefreshToken, user } = await authService.firebaseExchange({
      idToken,
      password,
      ipAddress,
      deviceInfo
    });

    // Set refresh token solely in HttpOnly cookie
    res.cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, rawRefreshToken, getRefreshCookieOptions());

    return ApiResponse.success(
      res,
      {
        accessToken,
        user
      },
      'Firebase authentication exchanged successfully'
    );
  } catch (err) {
    next(err);
  }
};


