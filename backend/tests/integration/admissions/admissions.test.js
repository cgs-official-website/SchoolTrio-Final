import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as admissionsService from '../../../src/modules/admissions/admissions.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError, ValidationError, NotFoundError } from '../../../src/utils/app-error.js';

describe('Integration: Admissions & Lead Management Endpoints (Phase ADMISSION.2)', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const FORM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const APP_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const CLASS_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const mockAdminUser = {
    id: 'admin-user-1',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'approved' }
  };

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ADMIN LEADS ENDPOINTS (/api/v1/admissions/leads)
  // =========================================================================
  describe('1. Admin Leads CRUD (/api/v1/admissions/leads)', () => {
    it('GET /api/v1/admissions/leads returns paginated list of leads', async () => {
      const mockLeads = [
        { id: LEAD_ID, schoolId: SCHOOL_ID, name: 'John Doe', phone: '9876543210', status: 'Cold' }
      ];
      const mockPagination = { total: 1, page: 1, limit: 50, totalPages: 1 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'listLeads').mockResolvedValue({ leads: mockLeads, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/admissions/leads?status=Cold&page=1&limit=50')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockLeads);
      expect(res.body.pagination).toBeDefined();
    });

    it('GET /api/v1/admissions/leads/:id returns single lead detail', async () => {
      const mockLead = { id: LEAD_ID, schoolId: SCHOOL_ID, name: 'John Doe', status: 'Hot' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'getLeadById').mockResolvedValue(mockLead);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/admissions/leads/${LEAD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('John Doe');
    });

    it('PATCH /api/v1/admissions/leads/:id/status updates lead status', async () => {
      const updatedLead = { id: LEAD_ID, schoolId: SCHOOL_ID, name: 'John Doe', status: 'Warm' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'updateLeadStatus').mockResolvedValue(updatedLead);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/admissions/leads/${LEAD_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID)
        .send({ status: 'Warm' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Warm');
    });

    it('DELETE /api/v1/admissions/leads/:id deletes a lead', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'deleteLead').mockResolvedValue({ id: LEAD_ID });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/admissions/leads/${LEAD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 2. ADMIN LEAD FORMS ENDPOINTS (/api/v1/admissions/forms)
  // =========================================================================
  describe('2. Admin Lead Forms (/api/v1/admissions/forms)', () => {
    it('POST /api/v1/admissions/forms creates a new dynamic lead form', async () => {
      const formPayload = {
        title: 'Admission 2026 Enquiry',
        description: 'Fill details',
        successMessage: 'Thanks!',
        fields: [{ id: 'f1', label: 'Name', type: 'text', required: true }],
        isActive: true
      };
      const createdForm = { id: FORM_ID, schoolId: SCHOOL_ID, ...formPayload };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'createLeadForm').mockResolvedValue(createdForm);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/admissions/forms')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID)
        .send(formPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Admission 2026 Enquiry');
    });

    it('GET /api/v1/admissions/forms lists all configured forms', async () => {
      const mockForms = [{ id: FORM_ID, title: 'Form A' }];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'listLeadForms').mockResolvedValue({ forms: mockForms, pagination: { total: 1 } });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/admissions/forms')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockForms);
    });
  });

  // =========================================================================
  // 3. PUBLIC ENDPOINTS (/api/v1/public/*)
  // =========================================================================
  describe('3. Public Inquiries & Admissions Endpoints', () => {
    it('GET /api/v1/public/admissions/schools/:schoolId/meta retrieves school admission meta without auth', async () => {
      const mockMeta = {
        id: SCHOOL_ID,
        schoolName: 'Spring Mount',
        classes: [{ id: CLASS_ID, name: 'Grade 1', gradeLevel: 1 }]
      };

      vi.spyOn(admissionsService, 'getPublicSchoolAdmissionMeta').mockResolvedValue(mockMeta);

      const res = await request(app)
        .get(`/api/v1/public/admissions/schools/${SCHOOL_ID}/meta`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.schoolName).toBe('Spring Mount');
    });

    it('GET /api/v1/public/leads/forms/:schoolId/:formId retrieves public form schema without auth', async () => {
      const mockPublicForm = {
        id: FORM_ID,
        title: 'Public Lead Form',
        fields: [{ id: 'f1', label: 'Parent Name', type: 'text', required: true }]
      };

      vi.spyOn(admissionsService, 'getPublicLeadForm').mockResolvedValue(mockPublicForm);

      const res = await request(app)
        .get(`/api/v1/public/leads/forms/${SCHOOL_ID}/${FORM_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Public Lead Form');
    });

    it('POST /api/v1/public/leads/:schoolId/:formId submits a public lead inquiry', async () => {
      vi.spyOn(admissionsService, 'submitPublicLead').mockResolvedValue({
        id: LEAD_ID,
        formId: FORM_ID,
        status: 'Cold'
      });

      const res = await request(app)
        .post(`/api/v1/public/leads/${SCHOOL_ID}/${FORM_ID}`)
        .send({
          data: {
            f1: 'Parent Jane'
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cold');
    });

    it('POST /api/v1/public/admissions/:schoolId submits an admission application', async () => {
      const appPayload = {
        firstName: 'Alice',
        lastName: 'Smith',
        dob: '2016-04-15',
        gender: 'Female',
        classId: CLASS_ID,
        parentName: 'Bob Smith',
        parentPhone: '9876543210',
        parentEmail: 'bob@example.com',
        homeAddress: '456 Oak Avenue'
      };

      vi.spyOn(admissionsService, 'submitPublicAdmission').mockResolvedValue({
        id: APP_ID,
        applicationNumber: 'ADM-2026-8421',
        studentName: 'Alice Smith',
        status: 'Pending'
      });

      const res = await request(app)
        .post(`/api/v1/public/admissions/${SCHOOL_ID}`)
        .send(appPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationNumber).toBe('ADM-2026-8421');
    });
  });

  // =========================================================================
  // 4. ADMIN APPLICATIONS & ENROLLMENT (/api/v1/admissions/applications)
  // =========================================================================
  describe('4. Admin Applications & Transactional Enrollment', () => {
    it('GET /api/v1/admissions/applications lists submitted applications', async () => {
      const mockApps = [
        { id: APP_ID, studentName: 'Alice Smith', status: 'Pending', parentPhone: '9876543210' }
      ];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'listApplications').mockResolvedValue({
        applications: mockApps,
        pagination: { total: 1 }
      });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/admissions/applications')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockApps);
    });

    it('PATCH /api/v1/admissions/applications/:id/status updates application status to Rejected', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'updateApplicationStatus').mockResolvedValue({
        id: APP_ID,
        status: 'Rejected'
      });

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/admissions/applications/${APP_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID)
        .send({ status: 'Rejected' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Rejected');
    });

    it('POST /api/v1/admissions/applications/:id/enroll admits applicant into Student directory', async () => {
      const enrollResult = {
        student: { id: 'student-1', admissionNumber: 'ADM-001', firstName: 'Alice', status: 'Active' },
        application: { id: APP_ID, status: 'Approved' }
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'enrollApplication').mockResolvedValue(enrollResult);

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/admissions/applications/${APP_ID}/enroll`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID)
        .send({
          admissionNumber: 'ADM-001',
          classId: CLASS_ID
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.admissionNumber).toBe('ADM-001');
      expect(res.body.data.application.status).toBe('Approved');
    });

    it('POST /api/v1/admissions/applications/:id/enroll rejects duplicate admission number with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(admissionsService, 'enrollApplication').mockRejectedValue(
        new ConflictError('Admission number "ADM-001" is already in use by another student')
      );

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/admissions/applications/${APP_ID}/enroll`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_ID)
        .send({
          admissionNumber: 'ADM-001',
          classId: CLASS_ID
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });
});
