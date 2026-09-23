import { describe, it, expect } from 'vitest';
import {
  listComplaintsSchema,
  complaintIdParamSchema,
  createComplaintSchema,
  updateComplaintStatusSchema
} from '../../../src/modules/complaints/complaint.schemas.js';

describe('Complaints Zod Schemas Unit Tests (CO.2)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  describe('createComplaintSchema', () => {
    it('validates a valid payload', () => {
      const result = createComplaintSchema.safeParse({
        body: {
          title: 'Broken light in classroom',
          description: 'The overhead fluorescent fixture in Room 204 is flickering continuously.'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.body.title).toBe('Broken light in classroom');
    });

    it('rejects missing or empty title', () => {
      const result = createComplaintSchema.safeParse({
        body: {
          title: '   ',
          description: 'Valid description'
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Title is required');
    });

    it('rejects title longer than 200 chars', () => {
      const result = createComplaintSchema.safeParse({
        body: {
          title: 'A'.repeat(201),
          description: 'Valid description'
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Title must not exceed 200 characters');
    });

    it('rejects missing or empty description', () => {
      const result = createComplaintSchema.safeParse({
        body: {
          title: 'Valid title',
          description: '   '
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Description is required');
    });
  });

  describe('listComplaintsSchema', () => {
    it('accepts valid query parameters and defaults pagination', () => {
      const result = listComplaintsSchema.safeParse({
        query: {
          status: 'pending',
          page: '2',
          limit: '15'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.query.status).toBe('pending');
      expect(result.data.query.page).toBe(2);
      expect(result.data.query.limit).toBe(15);
    });

    it('defaults page to 1 and limit to 20 when omitted', () => {
      const result = listComplaintsSchema.safeParse({
        query: {}
      });
      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(20);
    });

    it('rejects invalid status enum', () => {
      const result = listComplaintsSchema.safeParse({
        query: {
          status: 'in_progress'
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('status must be pending, resolved, or rejected');
    });

    it('rejects page < 1', () => {
      const result = listComplaintsSchema.safeParse({
        query: {
          page: '0'
        }
      });
      expect(result.success).toBe(false);
    });

    it('rejects limit > 100', () => {
      const result = listComplaintsSchema.safeParse({
        query: {
          limit: '101'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('complaintIdParamSchema', () => {
    it('accepts valid UUID', () => {
      const result = complaintIdParamSchema.safeParse({
        params: { id: VALID_UUID }
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed UUID', () => {
      const result = complaintIdParamSchema.safeParse({
        params: { id: 'not-a-uuid' }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Complaint ID must be a valid UUID');
    });
  });

  describe('updateComplaintStatusSchema', () => {
    it('accepts valid resolved status with notes', () => {
      const result = updateComplaintStatusSchema.safeParse({
        params: { id: VALID_UUID },
        body: {
          status: 'resolved',
          resolutionNotes: 'Electrician replaced the bulb and ballast.'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.body.status).toBe('resolved');
      expect(result.data.body.resolutionNotes).toBe('Electrician replaced the bulb and ballast.');
    });

    it('accepts valid rejected status with optional notes', () => {
      const result = updateComplaintStatusSchema.safeParse({
        params: { id: VALID_UUID },
        body: {
          status: 'rejected'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.body.status).toBe('rejected');
    });

    it('rejects invalid status', () => {
      const result = updateComplaintStatusSchema.safeParse({
        params: { id: VALID_UUID },
        body: {
          status: 'pending'
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('status must be resolved or rejected');
    });
  });
});
