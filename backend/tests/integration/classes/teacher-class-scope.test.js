import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration & Security: Teacher Class & Section Scoping and Authorization', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const CLASS_10_ID = 'aaaaaaaa-1010-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_11_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_12_ID = 'aaaaaaaa-1212-4aaa-8aaa-aaaaaaaaaaaa';

  const SEC_10A_ID = 'sec10aaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SEC_10B_ID = 'sec10bbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SEC_11A_ID = 'sec11aaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SEC_12B_ID = 'sec12bbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockDbClasses = [
    {
      id: CLASS_10_ID,
      schoolId: SCHOOL_ID,
      name: 'Class 10',
      gradeLevel: 10,
      sections: [
        { id: SEC_10A_ID, schoolId: SCHOOL_ID, classId: CLASS_10_ID, name: 'A', _count: { students: 25 } },
        { id: SEC_10B_ID, schoolId: SCHOOL_ID, classId: CLASS_10_ID, name: 'B', _count: { students: 24 } }
      ],
      _count: { students: 49, sections: 2 }
    },
    {
      id: CLASS_11_ID,
      schoolId: SCHOOL_ID,
      name: 'Class 11',
      gradeLevel: 11,
      sections: [
        { id: SEC_11A_ID, schoolId: SCHOOL_ID, classId: CLASS_11_ID, name: 'A', _count: { students: 20 } }
      ],
      _count: { students: 20, sections: 1 }
    },
    {
      id: CLASS_12_ID,
      schoolId: SCHOOL_ID,
      name: 'Class 12',
      gradeLevel: 12,
      sections: [
        { id: 'sec12aaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', schoolId: SCHOOL_ID, classId: CLASS_12_ID, name: 'A', _count: { students: 22 } },
        { id: SEC_12B_ID, schoolId: SCHOOL_ID, classId: CLASS_12_ID, name: 'B', _count: { students: 23 } }
      ],
      _count: { students: 45, sections: 2 }
    }
  ];

  const mockDbSections = [
    { id: SEC_10A_ID, schoolId: SCHOOL_ID, classId: CLASS_10_ID, name: 'A' },
    { id: SEC_10B_ID, schoolId: SCHOOL_ID, classId: CLASS_10_ID, name: 'B' },
    { id: SEC_11A_ID, schoolId: SCHOOL_ID, classId: CLASS_11_ID, name: 'A' },
    { id: 'sec12aaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', schoolId: SCHOOL_ID, classId: CLASS_12_ID, name: 'A' },
    { id: SEC_12B_ID, schoolId: SCHOOL_ID, classId: CLASS_12_ID, name: 'B' }
  ];

  const TEACHER_A_USER = {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    schoolId: SCHOOL_ID,
    email: 'teacher.a@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const TEACHER_B_USER = {
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    schoolId: SCHOOL_ID,
    email: 'teacher.b@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const TEACHER_D_USER = {
    id: 'dddddddd-4444-4444-8444-dddddddddddd',
    schoolId: SCHOOL_ID,
    email: 'teacher.d@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const ADMIN_USER = {
    id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Setup standard mock implementations for Prisma
    vi.spyOn(prisma.timetablePeriod, 'findMany').mockResolvedValue([]);

    vi.spyOn(prisma.section, 'findMany').mockImplementation(async (args = {}) => {
      const inIds = args.where?.id?.in;
      return mockDbSections.filter(s => {
        if (s.schoolId !== args.where?.schoolId) return false;
        if (args.where?.classId && s.classId !== args.where.classId) return false;
        if (Array.isArray(inIds) && !inIds.includes(s.id)) return false;
        return true;
      });
    });

    vi.spyOn(prisma.class, 'findMany').mockImplementation(async (args = {}) => {
      const inIds = args.where?.id?.in;
      if (Array.isArray(inIds)) {
        return mockDbClasses
          .filter(c => inIds.includes(c.id) && c.schoolId === args.where.schoolId)
          .map(c => ({
            ...c,
            sections: [...c.sections.map(s => ({ ...s }))]
          }));
      }
      return mockDbClasses
        .filter(c => c.schoolId === args.where.schoolId)
        .map(c => ({
          ...c,
          sections: [...c.sections.map(s => ({ ...s }))]
        }));
    });

    vi.spyOn(prisma.class, 'findFirst').mockImplementation(async (args = {}) => {
      const found = mockDbClasses.find(c => c.id === args.where.id && c.schoolId === args.where.schoolId);
      if (!found) return null;
      return {
        ...found,
        sections: [...found.sections.map(s => ({ ...s }))]
      };
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

  describe('Teacher Assigned Section vs Class Scoping (/api/v1/classes/my-classes)', () => {
    it('1. Teacher A (assigned Class 10 -> Section A) receives ONLY Section A, NOT Section B or Class 11', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_A_USER);

      vi.spyOn(prisma.staffProfile, 'findFirst').mockResolvedValue({
        id: 'staff-profile-a',
        schoolId: SCHOOL_ID,
        userId: TEACHER_A_USER.id,
        assignedClassId: CLASS_10_ID,
        customData: {
          assignments: {
            assignedClassId: SEC_10A_ID
          }
        },
        headedClasses: []
      });

      const token = getAuthToken(TEACHER_A_USER);
      const res = await request(app)
        .get('/api/v1/classes/my-classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(CLASS_10_ID);
      // Sections MUST be filtered to only Section A! Section B must NOT be present!
      expect(res.body.data[0].sections).toHaveLength(1);
      expect(res.body.data[0].sections[0].id).toBe(SEC_10A_ID);
      expect(res.body.data[0].sections[0].name).toBe('A');
    });

    it('2. Teacher B (assigned Class 10 -> Section B) receives ONLY Section B, NOT Section A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_B_USER);

      vi.spyOn(prisma.staffProfile, 'findFirst').mockResolvedValue({
        id: 'staff-profile-b',
        schoolId: SCHOOL_ID,
        userId: TEACHER_B_USER.id,
        assignedClassId: CLASS_10_ID,
        customData: {
          assignments: {
            assignedClassId: SEC_10B_ID
          }
        },
        headedClasses: []
      });

      const token = getAuthToken(TEACHER_B_USER);
      const res = await request(app)
        .get('/api/v1/classes/my-classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sections).toHaveLength(1);
      expect(res.body.data[0].sections[0].id).toBe(SEC_10B_ID);
      expect(res.body.data[0].sections[0].name).toBe('B');
    });

    it('3. Teacher D with multiple assignments (Class 10 -> Section A AND Class 12 -> Section B) receives only assigned sections', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_D_USER);

      vi.spyOn(prisma.staffProfile, 'findFirst').mockResolvedValue({
        id: 'staff-profile-d',
        schoolId: SCHOOL_ID,
        userId: TEACHER_D_USER.id,
        assignedClassId: CLASS_10_ID,
        customData: {
          assignments: {
            assignedClassId: SEC_10A_ID,
            subjectClassIds: [SEC_12B_ID]
          }
        },
        headedClasses: []
      });

      const token = getAuthToken(TEACHER_D_USER);
      const res = await request(app)
        .get('/api/v1/classes/my-classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);

      const c10 = res.body.data.find(c => c.id === CLASS_10_ID);
      expect(c10.sections).toHaveLength(1);
      expect(c10.sections[0].id).toBe(SEC_10A_ID);

      const c12 = res.body.data.find(c => c.id === CLASS_12_ID);
      expect(c12.sections).toHaveLength(1);
      expect(c12.sections[0].id).toBe(SEC_12B_ID);
    });
  });

  describe('IDOR / Authorization Protection (GET /api/v1/classes/:id)', () => {
    it('4 & 6. Teacher A is forbidden (403) from directly accessing Class 12 which is not assigned to them', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_A_USER);

      vi.spyOn(prisma.staffProfile, 'findFirst').mockResolvedValue({
        id: 'staff-profile-a',
        schoolId: SCHOOL_ID,
        userId: TEACHER_A_USER.id,
        assignedClassId: CLASS_10_ID,
        customData: {
          assignments: {
            assignedClassId: SEC_10A_ID
          }
        },
        headedClasses: []
      });

      const token = getAuthToken(TEACHER_A_USER);
      const res = await request(app)
        .get(`/api/v1/classes/${CLASS_12_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not authorized/i);
    });

    it('5. Teacher A accessing assigned Class 10 receives only their authorized section A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_A_USER);

      vi.spyOn(prisma.staffProfile, 'findFirst').mockResolvedValue({
        id: 'staff-profile-a',
        schoolId: SCHOOL_ID,
        userId: TEACHER_A_USER.id,
        assignedClassId: CLASS_10_ID,
        customData: {
          assignments: {
            assignedClassId: SEC_10A_ID
          }
        },
        headedClasses: []
      });

      const token = getAuthToken(TEACHER_A_USER);
      const res = await request(app)
        .get(`/api/v1/classes/${CLASS_10_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(CLASS_10_ID);
      expect(res.body.data.sections).toHaveLength(1);
      expect(res.body.data.sections[0].id).toBe(SEC_10A_ID);
    });
  });

  describe('Tenant Isolation, Unauthenticated & Non-Teacher Role Semantics', () => {
    it('8 & 9. Teacher cannot access classes from another school/tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_A_USER);

      const token = getAuthToken(TEACHER_A_USER);
      const res = await request(app)
        .get(`/api/v1/classes/99999999-8888-4888-8888-999999999999`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('10. Unauthenticated request to /api/v1/classes/my-classes is rejected (401)', async () => {
      const res = await request(app).get('/api/v1/classes/my-classes');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('11 & 12. School Admin receives all tenant classes with full section listings', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);
      vi.spyOn(prisma.class, 'count').mockResolvedValue(3);

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].sections).toHaveLength(2);
    });
  });
});
