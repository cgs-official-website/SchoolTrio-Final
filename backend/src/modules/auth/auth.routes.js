import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  loginSchema,
  admissionLoginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordSetupConfirmSchema,
  changePasswordSchema,
  firebaseExchangeSchema
} from './auth.schemas.js';
import * as authController from './auth.controller.js';

const router = Router();

/**
 * Authentication Rate Limiters
 * - Login: 10 requests per minute per IP
 * - Admission Login: 10 requests per minute per IP
 * - Refresh: 30 requests per minute per IP
 * - Password Reset Request (IP): 5 requests per minute
 * - Password Reset Request (Email): 3 requests per 15 minutes
 * - Password Reset Confirm: 10 requests per minute per IP
 * - Password Setup Confirm: 10 requests per minute per IP
 * - Change Password: 5 requests per minute per IP
 * - Firebase Exchange: 10 requests per minute per IP
 */
const loginRateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  keyPrefix: 'rl:auth:login:'
});

const admissionLoginRateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  keyPrefix: 'rl:auth:admission-login:'
});

const refreshRateLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  keyPrefix: 'rl:auth:refresh:'
});

const resetRequestIpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: 'rl:auth:pwd-reset-req-ip:'
});

const resetRequestEmailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: 'rl:auth:pwd-reset-req-email:',
  keyGenerator: (req) => (req.body?.email ? String(req.body.email).toLowerCase().trim() : req.ip || 'unknown')
});

const resetConfirmRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rl:auth:pwd-reset-confirm:'
});

const setupConfirmRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rl:auth:pwd-setup-confirm:'
});

const changePasswordRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: 'rl:auth:pwd-change:'
});

const firebaseExchangeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rl:auth:firebase-exchange:'
});

/**
 * POST /api/v1/auth/login
 * Public: Authenticates user via email and password.
 */
router.post('/login', loginRateLimiter, validate(loginSchema), authController.login);

/**
 * POST /api/v1/auth/admission-login
 * Public: Authenticates parent user via student admission number and school code.
 */
router.post(
  '/admission-login',
  admissionLoginRateLimiter,
  validate(admissionLoginSchema),
  authController.admissionLogin
);

/**
 * POST /api/v1/auth/firebase-exchange
 * Public (Token-based): Exchanges verified Firebase ID token for PostgreSQL JWT + refresh cookie.
 */
router.post(
  '/firebase-exchange',
  firebaseExchangeRateLimiter,
  validate(firebaseExchangeSchema),
  authController.firebaseExchange
);

/**
 * POST /api/v1/auth/password-reset/request
 * Public: Initiates password reset by dispatching an email with a 15-minute token.
 */
router.post(
  '/password-reset/request',
  resetRequestIpRateLimiter,
  resetRequestEmailRateLimiter,
  validate(passwordResetRequestSchema),
  authController.requestPasswordReset
);

/**
 * POST /api/v1/auth/password-reset/confirm
 * Public: Confirms password reset with 64-char hex token and sets new password.
 */
router.post(
  '/password-reset/confirm',
  resetConfirmRateLimiter,
  validate(passwordResetConfirmSchema),
  authController.confirmPasswordReset
);

/**
 * POST /api/v1/auth/password-setup/confirm
 * Public: Confirms first-time password setup for a locked account using a 24-hour setup token.
 */
router.post(
  '/password-setup/confirm',
  setupConfirmRateLimiter,
  validate(passwordSetupConfirmSchema),
  authController.confirmPasswordSetup
);

/**
 * POST /api/v1/auth/change-password
 * Authenticated: Changes password for currently authenticated user.
 */
router.post(
  '/change-password',
  authenticate,
  changePasswordRateLimiter,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * POST /api/v1/auth/refresh
 * Public (Cookie-based): Rotates the refresh session using HttpOnly cookie.
 */
router.post('/refresh', refreshRateLimiter, authController.refresh);

/**
 * POST /api/v1/auth/logout
 * Public/Optional (Cookie-based): Revokes current refresh session and clears cookie.
 */
router.post('/logout', authController.logout);

/**
 * POST /api/v1/auth/logout-all
 * Authenticated: Revokes all active refresh sessions for authenticated user.
 */
router.post('/logout-all', authenticate, authController.logoutAll);

/**
 * GET /api/v1/auth/me
 * Authenticated: Retrieves profile identity of authenticated user.
 */
router.get('/me', authenticate, authController.me);

export default router;


