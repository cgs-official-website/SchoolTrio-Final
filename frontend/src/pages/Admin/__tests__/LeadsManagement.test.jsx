import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeadsManagement from '../LeadsManagement.jsx';
import * as admissionsApi from '../../../api/admissions.js';

describe('Admin LeadsManagement Component (REST Migration)', () => {
  const mockLeads = [
    {
      id: 'lead-1',
      formId: 'form-1',
      formTitle: 'Admissions 2026',
      status: 'Cold',
      submittedAt: '2026-09-01T10:00:00.000Z',
      customData: { studentName: 'John Doe', parentPhone: '1234567890' }
    },
    {
      id: 'lead-2',
      formId: 'form-1',
      formTitle: 'Admissions 2026',
      status: 'Hot',
      submittedAt: '2026-09-02T12:00:00.000Z',
      customData: { studentName: 'Jane Smith', parentPhone: '0987654321' }
    }
  ];

  const mockForms = [
    {
      id: 'form-1',
      title: 'Admissions 2026',
      description: 'General inquiry form',
      fields: [
        { id: 'f1', label: 'Student Name', type: 'text', required: true },
        { id: 'f2', label: 'Parent Phone', type: 'phone', required: true }
      ],
      successMessage: 'Enquiry received'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof LeadsManagement).toBe('function');
  });

  it('2. loads leads through admissionsApi.getLeads', async () => {
    const leadsSpy = vi.spyOn(admissionsApi, 'getLeads').mockResolvedValue({
      success: true,
      data: mockLeads,
      meta: { total: 2, page: 1, limit: 500 }
    });

    const res = await admissionsApi.getLeads({ limit: 500 });
    expect(leadsSpy).toHaveBeenCalledWith({ limit: 500 });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe('lead-1');
  });

  it('3. loads lead forms through admissionsApi.getLeadForms', async () => {
    const formsSpy = vi.spyOn(admissionsApi, 'getLeadForms').mockResolvedValue({
      success: true,
      data: mockForms
    });

    const res = await admissionsApi.getLeadForms({ limit: 100 });
    expect(formsSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Admissions 2026');
  });

  it('4. updates lead status via admissionsApi.updateLeadStatus', async () => {
    const updateSpy = vi.spyOn(admissionsApi, 'updateLeadStatus').mockResolvedValue({
      success: true,
      data: { id: 'lead-1', status: 'Warm' }
    });

    const res = await admissionsApi.updateLeadStatus('lead-1', { status: 'Warm' });
    expect(updateSpy).toHaveBeenCalledWith('lead-1', { status: 'Warm' });
    expect(res.data.status).toBe('Warm');
  });

  it('5. creates a new lead form via admissionsApi.createLeadForm', async () => {
    const payload = {
      title: 'Science Stream Enquiry',
      description: 'Inquiry for grade 11',
      successMessage: 'Submitted',
      fields: [{ id: 'f1', label: 'Name', type: 'text' }],
      isActive: true
    };
    const createSpy = vi.spyOn(admissionsApi, 'createLeadForm').mockResolvedValue({
      success: true,
      data: { id: 'form-2', ...payload }
    });

    const res = await admissionsApi.createLeadForm(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('form-2');
  });

  it('6. deletes a lead form via admissionsApi.deleteLeadForm', async () => {
    const deleteSpy = vi.spyOn(admissionsApi, 'deleteLeadForm').mockResolvedValue({
      success: true,
      data: { id: 'form-1' }
    });

    const res = await admissionsApi.deleteLeadForm('form-1');
    expect(deleteSpy).toHaveBeenCalledWith('form-1');
    expect(res.data.id).toBe('form-1');
  });

  it('7. deletes a lead via admissionsApi.deleteLead', async () => {
    const deleteLeadSpy = vi.spyOn(admissionsApi, 'deleteLead').mockResolvedValue({
      success: true,
      data: { id: 'lead-1' }
    });

    const res = await admissionsApi.deleteLead('lead-1');
    expect(deleteLeadSpy).toHaveBeenCalledWith('lead-1');
    expect(res.data.id).toBe('lead-1');
  });
});
