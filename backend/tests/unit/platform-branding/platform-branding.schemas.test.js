import { describe, it, expect } from 'vitest';
import { updatePlatformBrandingSchema } from '../../../src/modules/platform-branding/platform-branding.schemas.js';

describe('Unit: Platform Branding Schemas', () => {
  describe('updatePlatformBrandingSchema', () => {
    it('accepts valid full branding updates', () => {
      const payload = {
        platformName: 'Apex Academy Platform',
        primaryColor: '#6366f1',
        logoUrl: 'https://cdn.example.com/logo.png',
        faviconUrl: 'https://cdn.example.com/favicon.ico',
        loginBackgroundImage: 'https://cdn.example.com/bg.jpg'
      };

      const result = updatePlatformBrandingSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
    });

    it('accepts valid partial updates', () => {
      const payload = {
        primaryColor: '#10b981'
      };

      const result = updatePlatformBrandingSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.primaryColor).toBe('#10b981');
    });

    it('accepts 3-digit hex color codes', () => {
      const result = updatePlatformBrandingSchema.safeParse({
        primaryColor: '#abc'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid color formats', () => {
      const invalidColors = ['red', 'rgb(255,0,0)', '#12345', '#1234567', '#xyz123'];
      for (const color of invalidColors) {
        const result = updatePlatformBrandingSchema.safeParse({ primaryColor: color });
        expect(result.success).toBe(false);
      }
    });

    it('rejects empty object (at least one field required)', () => {
      const result = updatePlatformBrandingSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('At least one branding field must be provided');
    });

    it('rejects unexpected arbitrary fields due to strict schema', () => {
      const result = updatePlatformBrandingSchema.safeParse({
        platformName: 'Test School',
        speculativeSetting: 'malicious-data',
        unknownField: 123
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some((e) => e.message.includes('Unexpected fields'))).toBe(true);
    });

    it('rejects empty strings for fields', () => {
      expect(updatePlatformBrandingSchema.safeParse({ platformName: '' }).success).toBe(false);
      expect(updatePlatformBrandingSchema.safeParse({ logoUrl: '   ' }).success).toBe(false);
      expect(updatePlatformBrandingSchema.safeParse({ faviconUrl: '' }).success).toBe(false);
      expect(updatePlatformBrandingSchema.safeParse({ loginBackgroundImage: '' }).success).toBe(false);
    });
  });
});
