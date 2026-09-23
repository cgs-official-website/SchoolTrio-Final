import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getLeadForms,
  getLeadFormById,
  createLeadForm,
  updateLeadForm,
  deleteLeadForm,
  getLeads,
  getLeadById,
  updateLeadStatus,
  deleteLead,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  enrollApplication,
  deleteApplication,
  getPublicLeadForm,
  submitPublicLead,
  getPublicSchoolMeta,
  submitPublicAdmission,
  admissionsApi
} from '../admissions.js';

describe('Admissions API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Lead Forms', () => {
    it('lists lead forms with filtered query params', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'form-1', title: 'Admissions 2026' }]
      });

      const res = await getLeadForms({ isActive: 'true', search: '2026', page: 1, limit: 10 });
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/forms?isActive=true&search=2026&page=1&limit=10', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('retrieves a lead form by ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'form-1', title: 'Admissions 2026' }
      });

      const res = await getLeadFormById('form-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/forms/form-1', { method: 'GET' });
      expect(res.data.id).toBe('form-1');
    });

    it('creates a new lead form', async () => {
      const payload = { title: 'New Form', fields: [{ id: 'f1', label: 'Name', type: 'text' }] };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'form-new', ...payload }
      });

      const res = await createLeadForm(payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/forms', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('form-new');
    });

    it('updates an existing lead form', async () => {
      const payload = { title: 'Updated Title' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'form-1', title: 'Updated Title' }
      });

      const res = await updateLeadForm('form-1', payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/forms/form-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.title).toBe('Updated Title');
    });

    it('deletes a lead form', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'form-1' }
      });

      const res = await deleteLeadForm('form-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/forms/form-1', { method: 'DELETE' });
      expect(res.data.id).toBe('form-1');
    });
  });

  describe('Leads Management', () => {
    it('lists leads with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'lead-1', status: 'Warm' }],
        meta: { total: 1, page: 1, limit: 50 }
      });

      const res = await getLeads({ status: 'Warm', search: 'John', page: 1, limit: 50 });
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/leads?status=Warm&search=John&page=1&limit=50', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('retrieves a single lead by ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'lead-1', status: 'Cold' }
      });

      const res = await getLeadById('lead-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/leads/lead-1', { method: 'GET' });
      expect(res.data.id).toBe('lead-1');
    });

    it('updates lead lifecycle status', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'lead-1', status: 'Hot' }
      });

      const res = await updateLeadStatus('lead-1', { status: 'Hot' });
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/leads/lead-1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Hot' })
      });
      expect(res.data.status).toBe('Hot');
    });

    it('deletes a lead', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'lead-1' }
      });

      const res = await deleteLead('lead-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/leads/lead-1', { method: 'DELETE' });
      expect(res.data.id).toBe('lead-1');
    });
  });

  describe('Admission Applications', () => {
    it('lists applications with filters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'app-1', studentName: 'Alice' }],
        meta: { total: 1 }
      });

      const res = await getApplications({ status: 'Pending', search: 'Alice' });
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/applications?status=Pending&search=Alice', {
        method: 'GET'
      });
      expect(res.data[0].studentName).toBe('Alice');
    });

    it('retrieves an application by ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'app-1', studentName: 'Alice' }
      });

      const res = await getApplicationById('app-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/applications/app-1', { method: 'GET' });
      expect(res.data.studentName).toBe('Alice');
    });

    it('updates application status', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'app-1', status: 'Approved' }
      });

      const res = await updateApplicationStatus('app-1', { status: 'Approved' });
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/applications/app-1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Approved' })
      });
      expect(res.data.status).toBe('Approved');
    });

    it('enrolls an application into the student directory', async () => {
      const payload = { admissionNumber: 'ADM-2026-001', classId: 'cls-1' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: {
          application: { id: 'app-1', status: 'Approved' },
          student: { id: 'stud-1', admissionNumber: 'ADM-2026-001' }
        }
      });

      const res = await enrollApplication('app-1', payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/applications/app-1/enroll', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.student.admissionNumber).toBe('ADM-2026-001');
    });

    it('deletes an application', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'app-1' }
      });

      const res = await deleteApplication('app-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/admissions/applications/app-1', { method: 'DELETE' });
      expect(res.data.id).toBe('app-1');
    });
  });

  describe('Public Endpoints', () => {
    it('retrieves public lead form configuration', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'form-1', title: 'Public Enquiry', fields: [] }
      });

      const res = await getPublicLeadForm('school-1', 'form-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/public/leads/forms/school-1/form-1', { method: 'GET' });
      expect(res.data.title).toBe('Public Enquiry');
    });

    it('submits a public lead inquiry', async () => {
      const payload = { data: { name: 'Parent', phone: '1234567890' } };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'lead-new', status: 'Cold' }
      });

      const res = await submitPublicLead('school-1', 'form-1', payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/public/leads/school-1/form-1', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('lead-new');
    });

    it('retrieves public school metadata and classes', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: {
          school: { id: 'school-1', name: 'Springfield High' },
          classes: [{ id: 'cls-1', name: 'Grade 1', section: 'A' }]
        }
      });

      const res = await getPublicSchoolMeta('school-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/public/admissions/schools/school-1/meta', { method: 'GET' });
      expect(res.data.school.name).toBe('Springfield High');
      expect(res.data.classes).toHaveLength(1);
    });

    it('submits a public student admission application', async () => {
      const payload = {
        studentName: 'Bob Smith',
        dob: '2015-05-10',
        gender: 'Male',
        parentName: 'Alice Smith',
        parentPhone: '9876543210',
        parentEmail: 'alice@example.com',
        address: '123 Main St',
        classId: 'cls-1'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'app-new', applicationNumber: 'ADM-2026-0001', status: 'Pending' }
      });

      const res = await submitPublicAdmission('school-1', payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/public/admissions/school-1', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.applicationNumber).toBe('ADM-2026-0001');
    });

    it('exposes all methods on the default admissionsApi object', () => {
      expect(admissionsApi.getLeadForms).toBe(getLeadForms);
      expect(admissionsApi.getLeads).toBe(getLeads);
      expect(admissionsApi.getApplications).toBe(getApplications);
      expect(admissionsApi.submitPublicLead).toBe(submitPublicLead);
      expect(admissionsApi.submitPublicAdmission).toBe(submitPublicAdmission);
    });
  });
});
