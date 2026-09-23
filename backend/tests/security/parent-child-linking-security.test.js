import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as parentRepository from '../../src/modules/parents/parent.repository.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security & Integration: Parent Child Linking & Unlinking Self-Service (Phase 4C.7-D.2-I-G.1)', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';

  const PARENT_USER_A_ID = 'cccccccc-3333-4333-8333-333333333333';
  const PARENT_PROFILE_A_ID = 'dddddddd-4444-4444-8444-444444444444';

  const PARENT_PROFILE_B_ID = 'ffffffff-6666-4666-8666-666666666666';

  const TEACHER_USER_ID = '12121212-7777-4777-8777-777777777777';
  const STUDENT_A_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
  const STUDENT_B_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

  const parentUserA = {
    id: PARENT_USER_A_ID,
    schoolId: SCHOOL_A,
    email: 'parenta@schoola.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const parentProfileA = {
    id: PARENT_PROFILE_A_ID,
    schoolId: SCHOOL_A,
    userId: PARENT_USER_A_ID,
    name: 'Parent Alice',
    phone: '9876543210',
    email: 'parenta@schoola.com'
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_A,
    email: 'teacher@schoola.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const studentA = {
    id: STUDENT_A_ID,
    schoolId: SCHOOL_A,
    admissionNumber: 'ADM-001',
    firstName: 'Charlie',
    lastName: 'Brown',
    dob: '2015-05-10',
    status: 'Active',
    classId: '33333333-3333-4333-8333-333333333333',
    sectionId: '44444444-4444-4444-8444-444444444444',
    class: { id: '33333333-3333-4333-8333-333333333333', name: 'Grade 5' },
    section: { id: '44444444-4444-4444-8444-444444444444', name: 'A' }
  };

  const studentB = {
    id: STUDENT_B_ID,
    schoolId: SCHOOL_B,
    admissionNumber: 'ADM-999',
    firstName: 'David',
    lastName: 'Smith',
    dob: '2014-03-20',
    status: 'Active',
    classId: '55555555-5555-4555-8555-555555555555',
    sectionId: '66666666-6666-4666-8666-666666666666',
    class: { id: '55555555-5555-4555-8555-555555555555', name: 'Grade 6' },
    section: { id: '66666666-6666-4666-8666-666666666666', name: 'B' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'mock-audit-id' });
    vi.spyOn(parentRepository, 'createParentStudentLink').mockResolvedValue({ id: 'mock-link-id' });
    vi.spyOn(parentRepository, 'deleteParentStudentLink').mockResolvedValue({ id: 'mock-link-id' });
    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
      students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
    });
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('A. POST /api/v1/parents/me/link-child (Link Child Self-Service)', () => {
    it('1. Parent can link valid child using admissionNumber + DOB', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockResolvedValue(studentA);
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);
      vi.spyOn(parentRepository, 'createParentStudentLink').mockResolvedValue({
        id: 'link-uuid-1',
        schoolId: SCHOOL_A,
        studentId: STUDENT_A_ID,
        parentProfileId: PARENT_PROFILE_A_ID,
        relationship: 'Mother',
        createdAt: new Date('2026-09-11T12:00:00Z'),
        student: studentA
      });

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('link-uuid-1');
      expect(res.body.data.relationship).toBe('Mother');
      expect(res.body.data.student.id).toBe(STUDENT_A_ID);
      expect(res.body.data.student.class.name).toBe('Grade 5');

      expect(parentRepository.findStudentByAdmissionAndDob).toHaveBeenCalledWith(SCHOOL_A, 'ADM-001', '2015-05-10');
      expect(parentRepository.createParentStudentLink).toHaveBeenCalledWith({
        schoolId: SCHOOL_A,
        studentId: STUDENT_A_ID,
        parentProfileId: PARENT_PROFILE_A_ID,
        relationship: 'Mother'
      });
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_A,
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('LINK_PARENT_STUDENT')
      }));
    });

    it('2. Invalid admissionNumber returns 404 (does not leak student existence)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockResolvedValue(null);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'NON_EXISTENT_ADM',
          dob: '2015-05-10',
          relationship: 'Father'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.createParentStudentLink).not.toHaveBeenCalled();
    });

    it('3. Wrong DOB fails with 404', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockResolvedValue(null);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-11', // Wrong DOB
          relationship: 'Mother'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.createParentStudentLink).not.toHaveBeenCalled();
    });

    it('4. Cross-tenant student cannot be linked (School A parent searching School B student)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockImplementation(async (schoolId) => {
        if (schoolId === SCHOOL_A) return null; // Tenant A doesn't have student B
        return studentB;
      });

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'ADM-999',
          dob: '2014-03-20',
          relationship: 'Father'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.findStudentByAdmissionAndDob).toHaveBeenCalledWith(SCHOOL_A, 'ADM-999', '2014-03-20');
      expect(parentRepository.createParentStudentLink).not.toHaveBeenCalled();
    });

    it('5. Unauthenticated request fails with 401', async () => {
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('6. Non-parent user (e.g. Teacher) fails with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('7. Supplied parentId/parentProfileId in body cannot spoof parent identity', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockResolvedValue(studentA);
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);
      vi.spyOn(parentRepository, 'createParentStudentLink').mockResolvedValue({
        id: 'link-uuid-1',
        schoolId: SCHOOL_A,
        studentId: STUDENT_A_ID,
        parentProfileId: PARENT_PROFILE_A_ID,
        relationship: 'Mother',
        createdAt: new Date(),
        student: studentA
      });

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: PARENT_PROFILE_B_ID, // Attempted spoof
          parentProfileId: PARENT_PROFILE_B_ID, // Attempted spoof
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      expect(res.status).toBe(201);
      // Link MUST be created with authenticated parent's profile ID (PARENT_PROFILE_A_ID)
      expect(parentRepository.createParentStudentLink).toHaveBeenCalledWith(expect.objectContaining({
        parentProfileId: PARENT_PROFILE_A_ID
      }));
    });

    it('8. Supplied schoolId header cannot override tenant boundary', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', SCHOOL_B) // Attempted cross-tenant header
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      // Tenant middleware rejects non-super-admin cross-tenant mismatch
      expect(res.status).toBe(403);
    });

    it('9. Duplicate link attempt returns 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findStudentByAdmissionAndDob').mockResolvedValue(studentA);
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue({ id: 'existing-link-id' });

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post('/api/v1/parents/me/link-child')
        .set('Authorization', `Bearer ${token}`)
        .send({
          admissionNumber: 'ADM-001',
          dob: '2015-05-10',
          relationship: 'Mother'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already linked');
    });
  });

  describe('B. DELETE /api/v1/parents/me/children/:studentId (Unlink Child Self-Service)', () => {
    it('12. Parent can unlink own child successfully', async () => {
      const mockLink = {
        id: 'link-uuid-1',
        relationship: 'Mother',
        parent: { name: 'Parent Alice' },
        student: { firstName: 'Charlie' }
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(mockLink);
      vi.spyOn(parentRepository, 'deleteParentStudentLink').mockResolvedValue(mockLink);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .delete(`/api/v1/parents/me/children/${STUDENT_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(parentRepository.deleteParentStudentLink).toHaveBeenCalledWith(
        SCHOOL_A,
        STUDENT_A_ID,
        PARENT_PROFILE_A_ID
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_A,
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('UNLINK_PARENT_STUDENT')
      }));
    });

    it('13. Parent cannot unlink another parent child relationship (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      // Link doesn't belong to Parent A
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .delete(`/api/v1/parents/me/children/${STUDENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.deleteParentStudentLink).not.toHaveBeenCalled();
    });

    it('14. Cross-tenant unlink fails (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue(parentProfileA);
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .delete(`/api/v1/parents/me/children/${STUDENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.deleteParentStudentLink).not.toHaveBeenCalled();
    });

    it('15. Invalid student UUID format fails with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .delete('/api/v1/parents/me/children/invalid-student-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('16. Unauthenticated request fails with 401', async () => {
      const res = await request(app)
        .delete(`/api/v1/parents/me/children/${STUDENT_A_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('17. Non-parent user fails with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .delete(`/api/v1/parents/me/children/${STUDENT_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('C. Regression & Protection Tests', () => {
    it('22. GET /api/v1/parents/me/children still functions properly', async () => {
      const mockChildren = [
        {
          id: 'link-uuid-1',
          relationship: 'Mother',
          createdAt: '2026-09-11T12:00:00.000Z',
          student: studentA
        }
      ];

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(parentRepository, 'findChildrenByParentUserId').mockResolvedValue(mockChildren);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .get('/api/v1/parents/me/children')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockChildren);
    });

    it('23. Staff-only POST /api/v1/students/:id/parents remains protected (rejects Parent with 403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_A_ID}/parents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentProfileId: PARENT_PROFILE_A_ID,
          relationship: 'Mother'
        });

      // Staff endpoint requires students:create permission which parent lacks
      expect(res.status).toBe(403);
    });

    it('24. Staff-only DELETE /api/v1/students/:studentId/parents/:parentId remains protected (rejects Parent with 403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .delete(`/api/v1/students/${STUDENT_A_ID}/parents/${PARENT_PROFILE_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      // Staff endpoint requires students:delete permission which parent lacks
      expect(res.status).toBe(403);
    });
  });
});
