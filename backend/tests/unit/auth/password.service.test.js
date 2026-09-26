import { describe, it, expect, vi } from 'vitest';
import argon2 from 'argon2';
import {
  hashPassword,
  verifyPassword,
  isLockedPassword,
  validatePasswordPolicy
} from '../../../src/modules/auth/password.service.js';
import { ValidationError } from '../../../src/utils/app-error.js';

describe('Password Service & Security Policy', () => {
  describe('validatePasswordPolicy', () => {
    it('passes for a valid strong password', () => {
      const result = validatePasswordPolicy('StrongPass123');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes at minimum length boundary (8 characters)', () => {
      const result = validatePasswordPolicy('Abc12345');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes at maximum length boundary (128 characters)', () => {
      const longPass = 'A1' + 'a'.repeat(126);
      expect(longPass.length).toBe(128);
      const result = validatePasswordPolicy(longPass);
      expect(result.isValid).toBe(true);
    });

    it('rejects password under 8 characters', () => {
      const result = validatePasswordPolicy('Ab1234');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('rejects password over 128 characters', () => {
      const tooLong = 'A1' + 'a'.repeat(127); // 129 chars
      const result = validatePasswordPolicy(tooLong);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 128 characters');
    });

    it('rejects password without uppercase letter', () => {
      const result = validatePasswordPolicy('lowercase123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('rejects password without lowercase letter', () => {
      const result = validatePasswordPolicy('UPPERCASE123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('rejects password without number', () => {
      const result = validatePasswordPolicy('NoNumbersHere');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('rejects non-string password candidates safely', () => {
      expect(validatePasswordPolicy(null).isValid).toBe(false);
      expect(validatePasswordPolicy(undefined).isValid).toBe(false);
      expect(validatePasswordPolicy(12345678).isValid).toBe(false);
      expect(validatePasswordPolicy({}).isValid).toBe(false);
      expect(validatePasswordPolicy([]).isValid).toBe(false);
    });
  });

  describe('isLockedPassword', () => {
    it('identifies !LOCKED_FIREBASE_AUTH_MANAGED as locked', () => {
      expect(isLockedPassword('!LOCKED_FIREBASE_AUTH_MANAGED')).toBe(true);
    });

    it('identifies arbitrary !LOCKED_* prefixes as locked', () => {
      expect(isLockedPassword('!LOCKED_ADMIN_PENDING')).toBe(true);
      expect(isLockedPassword('!LOCKED_CUSTOM_REASON')).toBe(true);
    });

    it('returns false for standard Argon2 hashes', () => {
      expect(isLockedPassword('$argon2id$v=19$m=65536,t=3,p=4$someHashValue')).toBe(false);
    });

    it('returns false for null, undefined, or empty values', () => {
      expect(isLockedPassword(null)).toBe(false);
      expect(isLockedPassword(undefined)).toBe(false);
      expect(isLockedPassword('')).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('successfully hashes a valid password using bcrypt', async () => {
      // Use lower cost parameters for fast unit test execution
      const hash = await hashPassword('ValidPassword123', 4);

      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('throws ValidationError if password fails policy', async () => {
      await expect(hashPassword('weak')).rejects.toThrow(ValidationError);
      await expect(hashPassword('weak')).rejects.toThrow('Password does not meet complexity requirements');
    });

    it('does not mutate or lowercase exact password characters', async () => {
      const pass = 'ExactPassword123!';
      const hash = await hashPassword(pass, { timeCost: 1, memoryCost: 4096, parallelism: 1 });
      const verifySuccess = await verifyPassword(hash, pass);
      const verifyLower = await verifyPassword(hash, pass.toLowerCase());

      expect(verifySuccess).toBe(true);
      expect(verifyLower).toBe(false);
    });
  });

  describe('verifyPassword', () => {
    it('verifies correct password against valid Argon2id hash', async () => {
      const pass = 'SecretPass123';
      const hash = await hashPassword(pass, { timeCost: 1, memoryCost: 4096, parallelism: 1 });

      const isValid = await verifyPassword(hash, pass);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password against valid Argon2id hash', async () => {
      const pass = 'SecretPass123';
      const hash = await hashPassword(pass, { timeCost: 1, memoryCost: 4096, parallelism: 1 });

      const isValid = await verifyPassword(hash, 'WrongPassword456');
      expect(isValid).toBe(false);
    });

    it('safely rejects locked migrated placeholder without invoking argon2.verify', async () => {
      const verifySpy = vi.spyOn(argon2, 'verify');

      const isValid = await verifyPassword('!LOCKED_FIREBASE_AUTH_MANAGED', 'AnyPassword123');
      expect(isValid).toBe(false);
      expect(verifySpy).not.toHaveBeenCalled();

      verifySpy.mockRestore();
    });

    it('returns false safely for invalid inputs', async () => {
      expect(await verifyPassword(null, 'SomePass123')).toBe(false);
      expect(await verifyPassword('someHash', null)).toBe(false);
      expect(await verifyPassword('', '')).toBe(false);
      expect(await verifyPassword('malformed-hash-string', 'ValidPass123')).toBe(false);
    });
  });
});
