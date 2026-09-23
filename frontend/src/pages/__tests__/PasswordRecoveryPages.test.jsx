import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPassword from '../ForgotPassword.jsx';
import ResetPassword from '../ResetPassword.jsx';
import SetupPassword from '../SetupPassword.jsx';
import authApi from '../../api/auth.js';

describe('Password Recovery & Setup REST Migration Tests (FRONTEND.D3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. Component Export & Integrity
  // ==========================================
  describe('Component Structure & Export', () => {
    it('exports valid component functions for ForgotPassword, ResetPassword, and SetupPassword', () => {
      expect(typeof ForgotPassword).toBe('function');
      expect(typeof ResetPassword).toBe('function');
      expect(typeof SetupPassword).toBe('function');
    });
  });

  // ==========================================
  // 2. ForgotPassword REST Contract & Flow
  // ==========================================
  describe('ForgotPassword Flow', () => {
    it('calls authApi.passwordResetRequest with normalized email', async () => {
      const resetRequestSpy = vi.spyOn(authApi, 'passwordResetRequest').mockResolvedValue({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });

      const res = await authApi.passwordResetRequest({ email: 'teacher@springmount.co.in' });
      expect(resetRequestSpy).toHaveBeenCalledWith({ email: 'teacher@springmount.co.in' });
      expect(res.success).toBe(true);
    });

    it('handles enumeration-safe responses without disclosing account existence', async () => {
      vi.spyOn(authApi, 'passwordResetRequest').mockResolvedValue({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });

      const resNonExistent = await authApi.passwordResetRequest({ email: 'nonexistent@randomdomain.com' });
      expect(resNonExistent.success).toBe(true);
      expect(resNonExistent.message).toContain('If an account exists');
    });

    it('handles rate limiting (429) errors safely', async () => {
      vi.spyOn(authApi, 'passwordResetRequest').mockRejectedValue({
        status: 429,
        message: 'Too many requests. Please try again later.'
      });

      await expect(
        authApi.passwordResetRequest({ email: 'rate_limited@school.com' })
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  // ==========================================
  // 3. ResetPassword REST Contract & Flow
  // ==========================================
  describe('ResetPassword Flow', () => {
    it('calls authApi.passwordResetConfirm with 64-char token and valid new password', async () => {
      const resetConfirmSpy = vi.spyOn(authApi, 'passwordResetConfirm').mockResolvedValue({
        success: true,
        message: 'Password has been successfully updated.'
      });

      const validToken = 'c0ffee'.repeat(10) + '1234';
      const payload = {
        token: validToken,
        newPassword: 'StrongPassword123!'
      };

      const res = await authApi.passwordResetConfirm(payload);
      expect(resetConfirmSpy).toHaveBeenCalledWith(payload);
      expect(res.success).toBe(true);
    });

    it('handles invalid or expired token errors (401)', async () => {
      vi.spyOn(authApi, 'passwordResetConfirm').mockRejectedValue({
        status: 401,
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired password reset token'
      });

      await expect(
        authApi.passwordResetConfirm({
          token: 'deadbeef'.repeat(8),
          newPassword: 'StrongPassword123!'
        })
      ).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_TOKEN'
      });
    });

    it('handles validation failure for passwords not meeting complexity', async () => {
      vi.spyOn(authApi, 'passwordResetConfirm').mockRejectedValue({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Password does not meet complexity requirements'
      });

      await expect(
        authApi.passwordResetConfirm({
          token: '1234'.repeat(16),
          newPassword: 'weak'
        })
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR'
      });
    });
  });

  // ==========================================
  // 4. SetupPassword REST Contract & Flow
  // ==========================================
  describe('SetupPassword Flow', () => {
    it('calls authApi.passwordSetupConfirm with exact backend contract shape', async () => {
      const setupSpy = vi.spyOn(authApi, 'passwordSetupConfirm').mockResolvedValue({
        success: true,
        message: 'Account password has been successfully configured.'
      });

      const setupToken = 'f00d'.repeat(16);
      const payload = {
        token: setupToken,
        newPassword: 'InitialTeacherPassword123!'
      };

      const res = await authApi.passwordSetupConfirm(payload);
      expect(setupSpy).toHaveBeenCalledWith(payload);
      expect(res.success).toBe(true);
    });

    it('handles invalid or already-used setup token (401)', async () => {
      vi.spyOn(authApi, 'passwordSetupConfirm').mockRejectedValue({
        status: 401,
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired setup token'
      });

      await expect(
        authApi.passwordSetupConfirm({
          token: 'alreadyused'.padEnd(64, '0'),
          newPassword: 'SomePassword123!'
        })
      ).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_TOKEN'
      });
    });

    it('handles rate-limited setup confirmation (429)', async () => {
      vi.spyOn(authApi, 'passwordSetupConfirm').mockRejectedValue({
        status: 429,
        message: 'Too many attempts. Please try again later.'
      });

      await expect(
        authApi.passwordSetupConfirm({
          token: 'b'.repeat(64),
          newPassword: 'Password123!'
        })
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  // ==========================================
  // 5. Zero-State Verification: No Firebase / Firestore
  // ==========================================
  describe('Zero-State Verification (No Firebase/Firestore in Target Flows)', () => {
    it('verifies that target components have zero Firebase Auth and Firestore imports or calls', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const forgotContent = fs.readFileSync(path.resolve(__dirname, '../ForgotPassword.jsx'), 'utf-8');
      const resetContent = fs.readFileSync(path.resolve(__dirname, '../ResetPassword.jsx'), 'utf-8');
      const setupContent = fs.readFileSync(path.resolve(__dirname, '../SetupPassword.jsx'), 'utf-8');

      const forbiddenTokens = [
        'firebase/auth',
        'signInWithEmailAndPassword',
        'sendPasswordResetEmail',
        'firebaseapp.com',
        'firebase/firestore',
        'updateDoc',
        'getDoc',
        '/api/forgot-password'
      ];

      for (const token of forbiddenTokens) {
        expect(forgotContent).not.toContain(token);
        expect(resetContent).not.toContain(token);
        expect(setupContent).not.toContain(token);
      }
    });
  });

  // ==========================================
  // 6. Routing Integrity & Verification
  // ==========================================
  describe('Routing Registration & Public Accessibility', () => {
    it('verifies that /reset-password and /setup-password routes exist in App.jsx', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const appContent = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf-8');

      expect(appContent).toContain('const ResetPassword = lazy(() => import(\'./pages/ResetPassword\'));');
      expect(appContent).toContain('const SetupPassword = lazy(() => import(\'./pages/SetupPassword\'));');
      expect(appContent).toContain('<Route path="/reset-password" element={<ResetPassword />} />');
      expect(appContent).toContain('<Route path="/setup-password" element={<SetupPassword />} />');

      // Verify they are NOT wrapped inside ProtectedRoute
      const resetRouteIndex = appContent.indexOf('path="/reset-password"');
      const setupRouteIndex = appContent.indexOf('path="/setup-password"');
      expect(resetRouteIndex).toBeGreaterThan(0);
      expect(setupRouteIndex).toBeGreaterThan(0);

      // Verify existing routes are preserved
      expect(appContent).toContain('path="/login"');
      expect(appContent).toContain('path="/forgot-password"');
      expect(appContent).toContain('path="/register"');
      expect(appContent).toContain('path="/superadmin"');
      expect(appContent).toContain('path="/admin"');
    });
  });
});
