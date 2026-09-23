import { describe, it, expect } from 'vitest';
import {
  templateParamsSchema,
  listTemplatesQuerySchema,
  createTemplateSchema,
  updateTemplateSchema,
  bulkUpdateTemplatesSchema
} from '../../../src/modules/email-templates/email-templates.schemas.js';

describe('Email Templates Schemas Unit Tests', () => {
  describe('templateParamsSchema', () => {
    it('passes validation for valid alphanumeric template IDs with underscores and hyphens', () => {
      expect(templateParamsSchema.params.safeParse({ id: 'welcome' }).success).toBe(true);
      expect(templateParamsSchema.params.safeParse({ id: 'forgotPassword' }).success).toBe(true);
      expect(templateParamsSchema.params.safeParse({ id: 'custom-template_1' }).success).toBe(true);
    });

    it('fails when template ID is empty or whitespace', () => {
      const result = templateParamsSchema.params.safeParse({ id: '   ' });
      expect(result.success).toBe(false);
    });

    it('fails when template ID contains invalid characters or script tags', () => {
      expect(templateParamsSchema.params.safeParse({ id: 'welcome<script>' }).success).toBe(false);
      expect(templateParamsSchema.params.safeParse({ id: 'welcome@school' }).success).toBe(false);
      expect(templateParamsSchema.params.safeParse({ id: 'welcome template' }).success).toBe(false);
    });
  });

  describe('listTemplatesQuerySchema', () => {
    it('accepts valid query filters', () => {
      const result = listTemplatesQuerySchema.query.safeParse({
        isActive: 'true',
        isSystem: 'false',
        search: 'Welcome'
      });
      expect(result.success).toBe(true);
    });

    it('fails when isActive is not boolean string', () => {
      const result = listTemplatesQuerySchema.query.safeParse({ isActive: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('createTemplateSchema', () => {
    const validCreatePayload = {
      name: 'Fee Reminder Notice',
      description: 'Sent before the quarterly fee payment deadline',
      subject: 'Upcoming Fee Payment Deadline',
      body: '<p>Dear Parent, your fee is due on {{dueDate}}.</p>',
      variables: ['{{dueDate}}', '{{studentName}}'],
      isActive: true
    };

    it('passes with valid payload', () => {
      const result = createTemplateSchema.body.safeParse(validCreatePayload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Fee Reminder Notice');
    });

    it('accepts html instead of body', () => {
      const { body, ...rest } = validCreatePayload;
      const result = createTemplateSchema.body.safeParse({
        ...rest,
        html: '<p>HTML version</p>'
      });
      expect(result.success).toBe(true);
    });

    it('fails when neither body nor html is provided', () => {
      const { body, ...rest } = validCreatePayload;
      const result = createTemplateSchema.body.safeParse(rest);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Either body or html');
    });

    it('fails when subject is missing or empty', () => {
      const result = createTemplateSchema.body.safeParse({
        ...validCreatePayload,
        subject: ''
      });
      expect(result.success).toBe(false);
    });

    it('fails on unexpected mass assignment fields in strict mode', () => {
      const result = createTemplateSchema.body.safeParse({
        ...validCreatePayload,
        schoolId: '11111111-1111-1111-1111-111111111111',
        isSystem: true
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTemplateSchema', () => {
    it('passes when updating subject only', () => {
      const result = updateTemplateSchema.body.safeParse({
        subject: 'Updated Welcome Email Subject'
      });
      expect(result.success).toBe(true);
    });

    it('passes when updating body content', () => {
      const result = updateTemplateSchema.body.safeParse({
        body: '<p>Updated content</p>'
      });
      expect(result.success).toBe(true);
    });

    it('passes when updating html content', () => {
      const result = updateTemplateSchema.body.safeParse({
        html: '<p>Updated HTML content</p>'
      });
      expect(result.success).toBe(true);
    });

    it('fails when body is empty object', () => {
      const result = updateTemplateSchema.body.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('At least one field');
    });

    it('fails when attempting to inject schoolId or id in update body', () => {
      const result = updateTemplateSchema.body.safeParse({
        subject: 'Valid Subject',
        schoolId: 'malicious-uuid',
        isSystem: false
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkUpdateTemplatesSchema', () => {
    it('passes with legacy flat format from frontend EmailTemplates.jsx', () => {
      const result = bulkUpdateTemplatesSchema.body.safeParse({
        welcomeSubject: 'Welcome to Acme School',
        welcomeHtml: '<p>Welcome!</p>',
        forgotPasswordSubject: 'Password Reset',
        forgotPasswordHtml: '<p>Reset link</p>'
      });
      expect(result.success).toBe(true);
    });

    it('passes with structured templates array', () => {
      const result = bulkUpdateTemplatesSchema.body.safeParse({
        templates: [
          {
            id: 'welcome',
            subject: 'Updated Subject',
            body: '<p>Updated</p>'
          }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('fails when no valid updates are supplied', () => {
      const result = bulkUpdateTemplatesSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
