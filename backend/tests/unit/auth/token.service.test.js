import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  issueAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getJwtSecret
} from '../../../src/modules/auth/token.service.js';
import { UnauthorizedError, ValidationError } from '../../../src/utils/app-error.js';

describe('JWT Token & Refresh Cryptography Service', () => {
  const sampleUserPayload = {
    sub: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    systemRole: 'TENANT_USER',
    tokenVersion: 2
  };

  describe('issueAccessToken', () => {
    it('issues a valid JWT with exact approved minimal claims', () => {
      const token = issueAccessToken(sampleUserPayload);
      expect(typeof token).toBe('string');

      const decoded = verifyAccessToken(token);

      expect(decoded.sub).toBe(sampleUserPayload.sub);
      expect(decoded.schoolId).toBe(sampleUserPayload.schoolId);
      expect(decoded.systemRole).toBe(sampleUserPayload.systemRole);
      expect(decoded.tokenVersion).toBe(sampleUserPayload.tokenVersion);
      expect(typeof decoded.jti).toBe('string');
      expect(decoded.jti.length).toBeGreaterThan(0);
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');

      // Verify 15-minute TTL (900 seconds)
      expect(decoded.exp - decoded.iat).toBe(900);
    });

    it('supports null schoolId for SuperAdmin platform users', () => {
      const superAdminPayload = {
        sub: '00000000-0000-0000-0000-000000000001',
        schoolId: null,
        systemRole: 'SUPER_ADMIN',
        tokenVersion: 1
      };

      const token = issueAccessToken(superAdminPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.sub).toBe(superAdminPayload.sub);
      expect(decoded.schoolId).toBeNull();
      expect(decoded.systemRole).toBe('SUPER_ADMIN');
    });

    it('strictly excludes permissions, role matrix, passwordHash, and legacy identifiers', () => {
      const token = issueAccessToken(sampleUserPayload);
      const decoded = jwt.decode(token);

      expect(decoded.permissions).toBeUndefined();
      expect(decoded.roles).toBeUndefined();
      expect(decoded.roleMatrix).toBeUndefined();
      expect(decoded.passwordHash).toBeUndefined();
      expect(decoded.legacyFirestoreId).toBeUndefined();
      expect(decoded.email).toBeUndefined();
    });

    it('throws ValidationError if sub is missing', () => {
      expect(() => issueAccessToken({ schoolId: 'some-id' })).toThrow(ValidationError);
      expect(() => issueAccessToken({ sub: '' })).toThrow('Subject (sub) is required');
    });
  });

  describe('verifyAccessToken', () => {
    it('successfully verifies a valid access token', () => {
      const token = issueAccessToken(sampleUserPayload);
      const payload = verifyAccessToken(token);
      expect(payload.sub).toBe(sampleUserPayload.sub);
    });

    it('rejects an expired token with TOKEN_EXPIRED error code', () => {
      const expiredToken = issueAccessToken(sampleUserPayload, { expiresIn: '-1s' });

      expect(() => verifyAccessToken(expiredToken)).toThrow(UnauthorizedError);
      try {
        verifyAccessToken(expiredToken);
      } catch (err) {
        expect(err.code).toBe('TOKEN_EXPIRED');
        expect(err.message).toContain('expired');
      }
    });

    it('rejects a malformed token with INVALID_TOKEN error code', () => {
      expect(() => verifyAccessToken('not-a-valid-jwt')).toThrow(UnauthorizedError);
      try {
        verifyAccessToken('not-a-valid-jwt');
      } catch (err) {
        expect(err.code).toBe('INVALID_TOKEN');
      }
    });

    it('rejects a tampered signature with INVALID_TOKEN error code', () => {
      const validToken = issueAccessToken(sampleUserPayload);
      const parts = validToken.split('.');
      // Alter the payload part
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker-id' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => verifyAccessToken(tamperedToken)).toThrow(UnauthorizedError);
      try {
        verifyAccessToken(tamperedToken);
      } catch (err) {
        expect(err.code).toBe('INVALID_TOKEN');
      }
    });

    it('rejects tokens signed with a different secret', () => {
      const foreignSecret = 'different-secret-key-32-chars-long-9876543210';
      const foreignToken = jwt.sign(sampleUserPayload, foreignSecret, { algorithm: 'HS256', expiresIn: '15m' });

      expect(() => verifyAccessToken(foreignToken)).toThrow(UnauthorizedError);
    });

    it('rejects tokens with non-HS256 algorithms (e.g. none)', () => {
      const noneToken = jwt.sign(sampleUserPayload, '', { algorithm: 'none' });

      expect(() => verifyAccessToken(noneToken)).toThrow(UnauthorizedError);
    });

    it('rejects missing or empty token input', () => {
      expect(() => verifyAccessToken('')).toThrow(UnauthorizedError);
      expect(() => verifyAccessToken(null)).toThrow(UnauthorizedError);
      expect(() => verifyAccessToken(undefined)).toThrow(UnauthorizedError);
    });
  });

  describe('generateRefreshToken & hashRefreshToken', () => {
    it('generates a 64-character hexadecimal cryptographically secure random token', () => {
      const token = generateRefreshToken();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates distinct random tokens on consecutive calls', () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();
      expect(token1).not.toBe(token2);
    });

    it('deterministically hashes a raw refresh token using SHA-256', () => {
      const raw = 'a'.repeat(64);
      const hash1 = hashRefreshToken(raw);
      const hash2 = hashRefreshToken(raw);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws ValidationError when hashing invalid input', () => {
      expect(() => hashRefreshToken(null)).toThrow(ValidationError);
      expect(() => hashRefreshToken('')).toThrow(ValidationError);
      expect(() => hashRefreshToken(12345)).toThrow(ValidationError);
    });
  });

  describe('getJwtSecret', () => {
    it('resolves a valid secret string', () => {
      const secret = getJwtSecret();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });
  });
});
