import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyFirebaseIdToken } from '../../../src/services/firebase-auth.service.js';
import { UnauthorizedError } from '../../../src/utils/app-error.js';


describe('Firebase Auth Service (firebase-auth.service.js)', () => {
  const defaultProjectId = 'school-management-system-6a2c4';

  const sampleDecodedToken = {
    uid: 'firebase-uid-staff-123',
    email: 'teacher@springmount.co.in',
    email_verified: true,
    auth_time: 1788950000,
    aud: defaultProjectId,
    iss: `https://securetoken.google.com/${defaultProjectId}`
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyFirebaseIdToken', () => {
    it('successfully verifies a valid Firebase ID token and extracts claims', async () => {
      const mockVerifier = vi.fn().mockResolvedValue(sampleDecodedToken);

      const result = await verifyFirebaseIdToken('valid-raw-firebase-id-token', {
        verifier: mockVerifier
      });

      expect(mockVerifier).toHaveBeenCalledWith('valid-raw-firebase-id-token');
      expect(result).toEqual({
        uid: 'firebase-uid-staff-123',
        email: 'teacher@springmount.co.in',
        emailVerified: true,
        authTime: 1788950000
      });
    });

    it('rejects empty, null, or non-string idToken', async () => {
      await expect(verifyFirebaseIdToken(null)).rejects.toThrow(UnauthorizedError);
      await expect(verifyFirebaseIdToken('')).rejects.toThrow(UnauthorizedError);
      await expect(verifyFirebaseIdToken('   ')).rejects.toThrow(UnauthorizedError);
      await expect(verifyFirebaseIdToken(12345)).rejects.toThrow(UnauthorizedError);
    });

    it('rejects token when verifier throws (e.g. invalid signature, expired)', async () => {
      const mockVerifier = vi.fn().mockRejectedValue(new Error('Firebase ID token has expired'));

      await expect(
        verifyFirebaseIdToken('expired-id-token', { verifier: mockVerifier })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects token issued for an unauthorized project (e.g. zuna-landing-page-22564 support desk)', async () => {
      const supportProjectToken = {
        ...sampleDecodedToken,
        aud: 'zuna-landing-page-22564',
        iss: 'https://securetoken.google.com/zuna-landing-page-22564'
      };
      const mockVerifier = vi.fn().mockResolvedValue(supportProjectToken);

      await expect(
        verifyFirebaseIdToken('support-project-token', { verifier: mockVerifier })
      ).rejects.toThrow(/unauthorized project/);
    });

    it('rejects token issued by an invalid issuer', async () => {
      const invalidIssuerToken = {
        ...sampleDecodedToken,
        iss: 'https://fakeissuer.google.com/school-management-system-6a2c4'
      };
      const mockVerifier = vi.fn().mockResolvedValue(invalidIssuerToken);

      await expect(
        verifyFirebaseIdToken('invalid-issuer-token', { verifier: mockVerifier })
      ).rejects.toThrow(/invalid issuer/);
    });

    it('rejects token missing subject UID', async () => {
      const noUidToken = {
        ...sampleDecodedToken,
        uid: undefined,
        sub: undefined
      };
      const mockVerifier = vi.fn().mockResolvedValue(noUidToken);

      await expect(
        verifyFirebaseIdToken('no-uid-token', { verifier: mockVerifier })
      ).rejects.toThrow(/missing subject identifier/);
    });

    it('normalizes email to lowercase and handles missing email', async () => {
      const tokenWithUpperEmail = {
        ...sampleDecodedToken,
        email: 'TEACHER.UPPER@SCHOOL.EDU',
        email_verified: false
      };
      const mockVerifier = vi.fn().mockResolvedValue(tokenWithUpperEmail);

      const result = await verifyFirebaseIdToken('token', { verifier: mockVerifier });
      expect(result.email).toBe('teacher.upper@school.edu');
      expect(result.emailVerified).toBe(false);
    });
  });
});
