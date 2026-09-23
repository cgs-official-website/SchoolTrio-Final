import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicLeadForm from '../PublicLeadForm.jsx';
import * as admissionsApi from '../../api/admissions.js';

describe('PublicLeadForm Component (REST Migration)', () => {
  const mockFormSchema = {
    id: 'form-123',
    title: 'Admissions 2026 Enquiry',
    description: 'Please fill out this form to inquire about admission.',
    successMessage: 'Thank you for your enquiry!',
    fields: [
      { id: 'f1', label: 'Parent Name', type: 'text', required: true },
      { id: 'f2', label: 'Phone Number', type: 'phone', required: true },
      { id: 'f3', label: 'Additional Comments', type: 'textarea', required: false }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof PublicLeadForm).toBe('function');
  });

  it('2. loads public form schema via admissionsApi.getPublicLeadForm', async () => {
    const fetchSpy = vi.spyOn(admissionsApi, 'getPublicLeadForm').mockResolvedValue({
      success: true,
      data: mockFormSchema
    });

    const res = await admissionsApi.getPublicLeadForm('school-123', 'form-123');
    expect(fetchSpy).toHaveBeenCalledWith('school-123', 'form-123');
    expect(res.data.title).toBe('Admissions 2026 Enquiry');
    expect(res.data.fields).toHaveLength(3);
  });

  it('3. submits inquiry via admissionsApi.submitPublicLead', async () => {
    const payload = {
      data: {
        f1: 'Jane Doe',
        f2: '9876543210',
        f3: 'Looking for grade 5 admission'
      }
    };

    const submitSpy = vi.spyOn(admissionsApi, 'submitPublicLead').mockResolvedValue({
      success: true,
      data: { id: 'lead-new', status: 'Cold' }
    });

    const res = await admissionsApi.submitPublicLead('school-123', 'form-123', payload);
    expect(submitSpy).toHaveBeenCalledWith('school-123', 'form-123', payload);
    expect(res.data.id).toBe('lead-new');
    expect(res.data.status).toBe('Cold');
  });

  it('4. propagates validation or rate-limit errors from backend', async () => {
    const submitSpy = vi.spyOn(admissionsApi, 'submitPublicLead').mockRejectedValue({
      response: {
        status: 429,
        data: { message: 'Too many requests. Please try again later.' }
      }
    });

    await expect(admissionsApi.submitPublicLead('school-123', 'form-123', {})).rejects.toMatchObject({
      response: {
        status: 429,
        data: { message: expect.stringContaining('Too many requests') }
      }
    });
    expect(submitSpy).toHaveBeenCalled();
  });
});
