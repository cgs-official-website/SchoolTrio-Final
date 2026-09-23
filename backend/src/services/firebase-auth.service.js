import fs from 'node:fs';
import admin from 'firebase-admin';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';
import { UnauthorizedError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

let firebaseApp = null;

/**
 * Initializes and returns the isolated Firebase Admin App for authentication verification.
 * Supports credentials from JSON string (FIREBASE_SERVICE_ACCOUNT_KEY), file path (FIREBASE_SERVICE_ACCOUNT_PATH),
 * or project ID configuration.
 *
 * @returns {admin.app.App} Initialized Firebase Admin application
 */
export const getFirebaseApp = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const appName = 'SchoolManagementAuthApp';
  const existingApp = admin.apps.find((a) => a && a.name === appName);
  if (existingApp) {
    firebaseApp = existingApp;
    return firebaseApp;
  }

  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
      firebaseApp = admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || env.FIREBASE_PROJECT_ID
        },
        appName
      );
    } else if (env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
      firebaseApp = admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || env.FIREBASE_PROJECT_ID
        },
        appName
      );
    } else {
      // Initialize with project ID (suitable for local emulator / GCP default environment)
      firebaseApp = admin.initializeApp(
        {
          projectId: env.FIREBASE_PROJECT_ID || 'school-management-system-6a2c4'
        },
        appName
      );
    }

    logger.info({
      msg: '[FIREBASE AUTH] Initialized Firebase Admin SDK',
      projectId: env.FIREBASE_PROJECT_ID || 'school-management-system-6a2c4'
    });

    return firebaseApp;
  } catch (err) {
    logger.error({
      msg: '[FIREBASE AUTH] Failed to initialize Firebase Admin SDK',
      error: err.message
    });
    // Fallback to minimal project config
    if (!firebaseApp) {
      firebaseApp = admin.initializeApp(
        {
          projectId: env.FIREBASE_PROJECT_ID || 'school-management-system-6a2c4'
        },
        `${appName}_fallback`
      );
    }
    return firebaseApp;
  }
};

/**
 * Cryptographically verifies a Firebase ID token server-side and extracts verified identity claims.
 * Enforces audience/project boundary matching against primary School Management project.
 *
 * @param {string} idToken - Raw Firebase ID token (JWT)
 * @param {Object} [options]
 * @param {Function} [options.verifier] - Optional custom verifier function for dependency injection in test suites
 * @returns {Promise<{ uid: string, email: string|null, emailVerified: boolean, authTime: number|null }>} Verified identity
 * @throws {UnauthorizedError} If token is missing, invalid, expired, or issued for an unauthorized project
 */
export const verifyFirebaseIdToken = async (idToken, { verifier = null } = {}) => {
  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    throw new UnauthorizedError('Firebase ID token is required', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  const expectedProjectId = env.FIREBASE_PROJECT_ID || 'school-management-system-6a2c4';
  let decodedToken;

  try {
    if (typeof verifier === 'function') {
      decodedToken = await verifier(idToken);
    } else {
      const app = getFirebaseApp();
      decodedToken = await admin.auth(app).verifyIdToken(idToken);
    }
  } catch (err) {
    logger.warn({
      msg: '[FIREBASE AUTH] Token verification failed',
      errorCode: err.code || 'VERIFICATION_FAILED'
    });
    throw new UnauthorizedError('Invalid or expired Firebase ID token', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  if (!decodedToken || typeof decodedToken !== 'object') {
    throw new UnauthorizedError('Invalid Firebase ID token payload', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  // 1. Strict Project Boundary & Audience Verification
  const tokenAudience = decodedToken.aud || decodedToken.firebase?.project_id;
  if (tokenAudience !== expectedProjectId) {
    logger.warn({
      msg: '[FIREBASE AUTH] Token rejected due to project boundary mismatch',
      expectedProject: expectedProjectId,
      receivedAudience: tokenAudience
    });
    throw new UnauthorizedError('Firebase token issued for unauthorized project', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  // 2. Strict Issuer Verification
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (decodedToken.iss && decodedToken.iss !== expectedIssuer) {
    logger.warn({
      msg: '[FIREBASE AUTH] Token rejected due to issuer mismatch',
      expectedIssuer,
      receivedIssuer: decodedToken.iss
    });
    throw new UnauthorizedError('Firebase token issued by invalid issuer', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  // 3. Extract verified UID
  const uid = decodedToken.uid || decodedToken.sub;
  if (!uid || typeof uid !== 'string') {
    throw new UnauthorizedError('Firebase token missing subject identifier', ERROR_CODES.INVALID_FIREBASE_TOKEN);
  }

  const email = decodedToken.email ? String(decodedToken.email).toLowerCase().trim() : null;
  const emailVerified = Boolean(decodedToken.email_verified);
  const authTime = decodedToken.auth_time || null;

  return {
    uid,
    email,
    emailVerified,
    authTime
  };
};
