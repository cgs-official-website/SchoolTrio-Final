import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validateResetEmail, getResetErrorMessage } from './ForgotPassword.jsx';
import { checkPasswordPolicy, getConfirmErrorMessage } from './ResetPassword.jsx';

describe('FORGOT-PASSWORD-001: Frontend Password Reset & Recovery Suite', () => {
  const forgotPasswordPath = path.resolve(__dirname, 'ForgotPassword.jsx');
  const forgotPasswordContent = fs.readFileSync(forgotPasswordPath, 'utf-8');

  const resetPasswordPath = path.resolve(__dirname, 'ResetPassword.jsx');
  const resetPasswordContent = fs.readFileSync(resetPasswordPath, 'utf-8');

  describe('1. ForgotPassword Email Validation (validateResetEmail)', () => {
    it('rejects empty and whitespace-only email inputs', () => {
      expect(validateResetEmail('')).toEqual({
        valid: false,
        error: 'Please enter your email address.'
      });
      expect(validateResetEmail('   ')).toEqual({
        valid: false,
        error: 'Please enter your email address.'
      });
      expect(validateResetEmail(null)).toEqual({
        valid: false,
        error: 'Please enter your email address.'
      });
    });

    it('rejects malformed email formats', () => {
      expect(validateResetEmail('invalid-email')).toEqual({
        valid: false,
        error: 'Please enter a valid email address.'
      });
      expect(validateResetEmail('user@')).toEqual({
        valid: false,
        error: 'Please enter a valid email address.'
      });
      expect(validateResetEmail('@domain.com')).toEqual({
        valid: false,
        error: 'Please enter a valid email address.'
      });
      expect(validateResetEmail('user@domain')).toEqual({
        valid: false,
        error: 'Please enter a valid email address.'
      });
    });

    it('accepts valid emails and normalizes to lowercase', () => {
      const result = validateResetEmail('  Principal@GreenField.EDU  ');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.email).toBe('principal@greenfield.edu');
    });
  });

  describe('2. ForgotPassword Error Feedback (getResetErrorMessage)', () => {
    it('provides user-friendly rate limit warning on HTTP 429', () => {
      const msg = getResetErrorMessage({ status: 429 });
      expect(msg).toBe('Too many requests. Please wait a few moments before trying again.');
    });

    it('provides clear message on HTTP 400 validation error', () => {
      const msg = getResetErrorMessage({ status: 400, message: 'Invalid email syntax' });
      expect(msg).toBe('Invalid email syntax');
    });

    it('provides resilient retry message on provider/network failure (503 / 500)', () => {
      const msg = getResetErrorMessage({ status: 503, message: 'Unable to process password reset request at this time. Please try again later.' });
      expect(msg).toContain('try again later');
    });
  });

  describe('3. ForgotPassword Component Security & UX Contracts', () => {
    it('dispatches client window origin to prevent origin guessing', () => {
      expect(forgotPasswordContent).toContain('window.location?.origin');
      expect(forgotPasswordContent).toContain('frontendUrl');
    });

    it('includes accessible loading states and disable attributes during submission', () => {
      expect(forgotPasswordContent).toContain('disabled={loading}');
      expect(forgotPasswordContent).toContain('Sending...');
    });

    it('displays unambiguous success state without leaking whether account exists', () => {
      expect(forgotPasswordContent).toContain('Check your email');
      expect(forgotPasswordContent).toContain('If an account exists for');
    });
  });

  describe('4. ResetPassword Complexity Policy (checkPasswordPolicy)', () => {
    it('rejects passwords shorter than 8 characters', () => {
      const result = checkPasswordPolicy('Aa1!');
      expect(result.hasMinLength).toBe(false);
      expect(result.isPolicyMet).toBe(false);
    });

    it('rejects passwords missing uppercase letters', () => {
      const result = checkPasswordPolicy('lowercase123!');
      expect(result.hasUppercase).toBe(false);
      expect(result.isPolicyMet).toBe(false);
    });

    it('rejects passwords missing lowercase letters', () => {
      const result = checkPasswordPolicy('UPPERCASE123!');
      expect(result.hasLowercase).toBe(false);
      expect(result.isPolicyMet).toBe(false);
    });

    it('rejects passwords missing numbers', () => {
      const result = checkPasswordPolicy('NoNumbersHere!');
      expect(result.hasNumber).toBe(false);
      expect(result.isPolicyMet).toBe(false);
    });

    it('accepts passwords meeting all complexity criteria', () => {
      const result = checkPasswordPolicy('ValidPassword123');
      expect(result.hasMinLength).toBe(true);
      expect(result.hasUppercase).toBe(true);
      expect(result.hasLowercase).toBe(true);
      expect(result.hasNumber).toBe(true);
      expect(result.isPolicyMet).toBe(true);
    });
  });

  describe('5. ResetPassword Token & Error Handling (getConfirmErrorMessage)', () => {
    it('informs user clearly when reset link is expired or consumed (HTTP 401 / INVALID_TOKEN)', () => {
      expect(getConfirmErrorMessage({ status: 401 })).toContain('invalid, expired, or has already been used');
      expect(getConfirmErrorMessage({ code: 'INVALID_TOKEN' })).toContain('invalid, expired, or has already been used');
    });

    it('informs user when rate limit is exceeded on confirmation', () => {
      expect(getConfirmErrorMessage({ status: 429 })).toContain('Too many attempts');
    });

    it('ensures token extraction checks URL search params and hash fallback', () => {
      expect(resetPasswordContent).toContain("searchParams.get('token')");
      expect(resetPasswordContent).toContain("new URLSearchParams(window.location.search).get('token')");
    });
  });
});
