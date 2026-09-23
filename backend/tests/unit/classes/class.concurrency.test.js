import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as classService from '../../../src/modules/classes/class.service.js';
import * as classRepository from '../../../src/modules/classes/class.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Unit: Class Teacher Concurrency & Transaction Serialization — Phase 4C.2-A.2.2', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_X_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111';
  const CLASS_Y_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-222222222222';
  const TEACHER_T_ID = 'cccccccc-cccc-4ccc-8ccc-tttttttttttt';

  const mockActor = {
    userId: 'admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes concurrent teacher assignments: teacher belongs to at most one class', async () => {
    // Simulated database state
    const db = {
      classes: {
        [CLASS_X_ID]: { id: CLASS_X_ID, name: 'Class X', schoolId: SCHOOL_ID, classTeacherId: null },
        [CLASS_Y_ID]: { id: CLASS_Y_ID, name: 'Class Y', schoolId: SCHOOL_ID, classTeacherId: null }
      },
      staff: {
        [TEACHER_T_ID]: { id: TEACHER_T_ID, schoolId: SCHOOL_ID, status: 'Active', assignedClassId: null }
      }
    };

    // Mock findClassById
    vi.spyOn(classRepository, 'findClassById').mockImplementation(async (_schoolId, classId) => {
      return db.classes[classId] ? { ...db.classes[classId] } : null;
    });

    // Mock findStaffProfileById
    vi.spyOn(classRepository, 'findStaffProfileById').mockImplementation(async (_schoolId, staffId) => {
      return db.staff[staffId] ? { ...db.staff[staffId] } : null;
    });

    // Mock findClassByClassTeacherId
    vi.spyOn(classRepository, 'findClassByClassTeacherId').mockImplementation(async (_schoolId, staffId) => {
      for (const c of Object.values(db.classes)) {
        if (c.classTeacherId === staffId) return { ...c };
      }
      return null;
    });

    // Mock clearClassTeacherOnClass
    vi.spyOn(classRepository, 'clearClassTeacherOnClass').mockImplementation(async (_schoolId, classId) => {
      if (db.classes[classId]) {
        db.classes[classId].classTeacherId = null;
      }
      return db.classes[classId];
    });

    // Mock updateStaffAssignedClass
    vi.spyOn(classRepository, 'updateStaffAssignedClass').mockImplementation(async (_schoolId, staffId, classId) => {
      if (db.staff[staffId]) {
        db.staff[staffId].assignedClassId = classId;
      }
      return db.staff[staffId];
    });

    // Mock updateClass
    vi.spyOn(classRepository, 'updateClass').mockImplementation(async (_schoolId, classId, data) => {
      if (db.classes[classId]) {
        Object.assign(db.classes[classId], data);
      }
      return db.classes[classId];
    });

    // Simulate PostgreSQL transaction lock queue: transactions serialize execution
    let txLock = Promise.resolve();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      const currentLock = txLock;
      let release;
      txLock = new Promise((resolve) => {
        release = resolve;
      });
      await currentLock;
      try {
        return await callback(prisma);
      } finally {
        release();
      }
    });

    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

    // Execute Request 1 (T -> Class X) and Request 2 (T -> Class Y) concurrently
    await Promise.all([
      classService.updateClass(SCHOOL_ID, CLASS_X_ID, { classTeacherId: TEACHER_T_ID }, mockActor),
      classService.updateClass(SCHOOL_ID, CLASS_Y_ID, { classTeacherId: TEACHER_T_ID }, mockActor)
    ]);

    // Invariant 1: StaffProfile assignedClassId points to exactly one class (either X or Y)
    const finalAssignedClassId = db.staff[TEACHER_T_ID].assignedClassId;
    expect([CLASS_X_ID, CLASS_Y_ID]).toContain(finalAssignedClassId);

    // Invariant 2: Only the class matching assignedClassId has classTeacherId set to Teacher T
    if (finalAssignedClassId === CLASS_Y_ID) {
      expect(db.classes[CLASS_Y_ID].classTeacherId).toBe(TEACHER_T_ID);
      expect(db.classes[CLASS_X_ID].classTeacherId).toBeNull();
    } else {
      expect(db.classes[CLASS_X_ID].classTeacherId).toBe(TEACHER_T_ID);
      expect(db.classes[CLASS_Y_ID].classTeacherId).toBeNull();
    }
  });
});
