import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as registrationService from '../../src/modules/registration/registration.service.js';

describe('Registration HTTP Routes Integration Tests', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  // ==========================================
  // 1. School Registration Route
  // ==========================================
  describe('POST /api/v1/public/schools/register', () => {
    it('returns 201 Created on valid registration', async () => {
      vi.spyOn(registrationService, 'registerSchool').mockResolvedValue({
        school: {
          id: 'school-1',
          name: 'Apex Academy',
          code: 'APEX-01',
          status: 'pending'
        },
        admin: {
          id: 'admin-1',
          email: 'admin@apex.edu',
          name: 'Apex Admin'
        }
      });

      const response = await request(app)
        .post('/api/v1/public/schools/register')
        .send({
          name: 'Apex Academy',
          code: 'apex-01',
          admin: {
            name: 'Apex Admin',
            email: 'admin@apex.edu',
            password: 'AdminPassword123'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.school.status).toBe('pending');
      expect(response.body.data.admin.email).toBe('admin@apex.edu');
    });

    it('returns 400 Bad Request when validation fails', async () => {
      const response = await request(app)
        .post('/api/v1/public/schools/register')
        .send({
          name: '',
          code: 'invalid code spaces'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================
  // 2. Teacher Registration Route & Alias
  // ==========================================
  describe('POST /api/v1/public/teachers/register', () => {
    it('returns 200 OK on successful teacher activation', async () => {
      vi.spyOn(registrationService, 'registerTeacher').mockResolvedValue({
        staff: {
          id: 'staff-1',
          name: 'Teacher One',
          email: 'teacher@school.edu',
          status: 'Active'
        },
        user: {
          id: 'user-1',
          email: 'teacher@school.edu'
        }
      });

      const response = await request(app)
        .post('/api/v1/public/teachers/register')
        .send({
          schoolId: '11111111-1111-4111-8111-111111111111',
          email: 'teacher@school.edu',
          password: 'TeacherPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.staff.status).toBe('Active');
    });

    it('supports the alias route /api/v1/public/teacher-registration', async () => {
      vi.spyOn(registrationService, 'registerTeacher').mockResolvedValue({
        staff: { id: 'staff-1', name: 'Teacher One', email: 'teacher@school.edu', status: 'Active' },
        user: { id: 'user-1', email: 'teacher@school.edu' }
      });

      const response = await request(app)
        .post('/api/v1/public/teacher-registration')
        .send({
          schoolId: '11111111-1111-4111-8111-111111111111',
          email: 'teacher@school.edu',
          password: 'TeacherPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ==========================================
  // 3. Parent Registration Route & Alias
  // ==========================================
  describe('POST /api/v1/public/parents/register', () => {
    it('returns 201 Created on successful parent registration and linking', async () => {
      vi.spyOn(registrationService, 'registerParent').mockResolvedValue({
        parent: { id: 'parent-1', name: 'Parent One', email: 'parent@school.edu' },
        student: { id: 'student-1', admissionNumber: 'ADM-101', firstName: 'Child' }
      });

      const response = await request(app)
        .post('/api/v1/public/parents/register')
        .send({
          schoolId: '11111111-1111-4111-8111-111111111111',
          name: 'Parent One',
          email: 'parent@school.edu',
          password: 'ParentPassword123',
          admissionNumber: 'ADM-101',
          dob: '2016-01-15',
          relationship: 'Mother'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.parent.name).toBe('Parent One');
      expect(response.body.data.student.admissionNumber).toBe('ADM-101');
    });

    it('supports the alias route /api/v1/public/parent-registration', async () => {
      vi.spyOn(registrationService, 'registerParent').mockResolvedValue({
        parent: { id: 'parent-1', name: 'Parent One', email: 'parent@school.edu' },
        student: { id: 'student-1', admissionNumber: 'ADM-101' }
      });

      const response = await request(app)
        .post('/api/v1/public/parent-registration')
        .send({
          schoolId: '11111111-1111-4111-8111-111111111111',
          name: 'Parent One',
          email: 'parent@school.edu',
          password: 'ParentPassword123',
          admissionNumber: 'ADM-101',
          dob: '2016-01-15',
          relationship: 'Mother'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });
});
