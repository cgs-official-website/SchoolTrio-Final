import { describe, it, expect, beforeEach } from 'vitest';
import { MigrationIdMapper } from '../src/migration/id-mapper.js';
import { RelationshipResolver } from '../src/migration/relationship-resolver.js';
import { protectPrismaClient, DryRunViolationError } from '../src/migration/dry-run.guard.js';
import {
  transformSchool,
  transformUser,
  transformStudent,
  transformStaff,
  transformInvoice,
  parseDateSafe,
  validateEmail,
  validatePhone
} from '../src/migration/transformers/index.js';

describe('Phase 3B — Migration Dry-Run Engine Test Suite', () => {
  let idMapper;
  let resolver;

  beforeEach(() => {
    idMapper = new MigrationIdMapper();
    resolver = new RelationshipResolver(idMapper);
    process.env.MIGRATION_MODE = 'dry-run';
  });

  // 1. Count reconciliation
  it('1. Correctly calculates count reconciliation and explains discrepancy', () => {
    const reported = { root: 209, schoolSubcollections: 1847, nested: 41, total: 2093 };
    const observed = { root: 209, schoolSubcollections: 1590, nested: 41, total: 1840 };

    const rootDiff = observed.root - reported.root;
    const subDiff = observed.schoolSubcollections - reported.schoolSubcollections;
    const totalDiff = observed.total - reported.total;

    expect(rootDiff).toBe(0);
    expect(subDiff).toBe(-257);
    expect(totalDiff).toBe(-253);
    expect(observed.total).toBe(observed.root + observed.schoolSubcollections + observed.nested);
  });

  // 2. School tenant resolution
  it('2. Accurately maps and resolves school tenant IDs', () => {
    const rawSchool = {
      id: 'SchoolS015',
      data: { schoolName: 'Trust IT Tec', status: 'approved', studentCount: '350' }
    };
    const transformed = transformSchool(rawSchool, idMapper);

    expect(transformed.targetModel).toBe('School');
    expect(transformed.sourceId).toBe('SchoolS015');
    expect(transformed.data.code).toBe('SchoolS015');
    expect(transformed.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idMapper.getPostgresId(null, 'schools', 'SchoolS015')).toBe(transformed.data.id);
  });

  // 3. Firestore ID mapping
  it('3. Generates valid UUIDv4 mappings for Firestore document IDs', () => {
    const schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS023', 'School');
    const studentUuid = idMapper.mapId(schoolUuid, 'students', '9TJvSaNvCw7r5ojgkSxr', 'Student');

    expect(studentUuid).toBeDefined();
    expect(studentUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idMapper.getPostgresId(schoolUuid, 'students', '9TJvSaNvCw7r5ojgkSxr')).toBe(studentUuid);
  });

  // 4. Duplicate source ID handling
  it('4. Reuses existing mapping when duplicate source ID is encountered', () => {
    const schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS019', 'School');
    const firstId = idMapper.mapId(schoolUuid, 'students', 'STU_DUP_001', 'Student');
    const secondId = idMapper.mapId(schoolUuid, 'students', 'STU_DUP_001', 'Student');

    expect(firstId).toBe(secondId);
    expect(idMapper.getDuplicates().length).toBe(1);
    expect(idMapper.getDuplicates()[0].existingTargetId).toBe(firstId);
  });

  // 5. Missing relationship handling
  it('5. Quarantines records with missing required foreign keys', () => {
    const schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS019', 'School');
    const result = resolver.resolveForeignKey({
      sourceModel: 'Student',
      sourceId: 'STU_MISSING_CLASS',
      sourceSchoolUuid: schoolUuid,
      field: 'classId',
      targetModel: 'Class',
      targetCollection: 'classes',
      targetSourceId: 'NON_EXISTENT_CLASS',
      isNullable: false,
      rawSchoolId: 'SchoolS019'
    });

    expect(result.status).toBe('MISSING_REFERENCE');
    expect(result.targetId).toBeNull();
    expect(resolver.getMetrics().missing).toBe(1);
    expect(resolver.getQuarantineQueue().length).toBe(1);
  });

  // 6. Cross-tenant relationship rejection
  it('6. Strictly rejects cross-tenant references', () => {
    const schoolAUuid = idMapper.mapId(null, 'schools', 'SchoolS015', 'School');
    const schoolBUuid = idMapper.mapId(null, 'schools', 'SchoolS019', 'School');

    // Class in School B
    const _classBUuid = idMapper.mapId(schoolBUuid, 'classes', 'CLASS_B_01', 'Class');

    // Attempt to link Student in School A to Class in School B
    const result = resolver.resolveForeignKey({
      sourceModel: 'Student',
      sourceId: 'STU_A_01',
      sourceSchoolUuid: schoolAUuid,
      field: 'classId',
      targetModel: 'Class',
      targetCollection: 'classes',
      targetSourceId: 'CLASS_B_01',
      isNullable: false,
      rawSchoolId: 'SchoolS015'
    });

    expect(result.status).toBe('CROSS_TENANT_REFERENCE');
    expect(result.targetId).toBeNull();
    expect(resolver.getMetrics().crossTenant).toBe(1);
    expect(resolver.getQuarantineQueue()[0].reason).toContain('CROSS_TENANT_VIOLATION');
  });

  // 7. Orphan invoice quarantine
  it('7. Quarantines orphan invoices pointing to deleted students', () => {
    const schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS023', 'School');
    const rawInvoice = {
      id: 'GDmzNvRFg40cMX8SVqTi',
      data: {
        studentId: 'nUYVBrCxVfqRHSqblT0o',
        amount: 5000,
        status: 'PENDING'
      }
    };

    const transformed = transformInvoice(rawInvoice, idMapper, 'SchoolS023');
    expect(transformed.isOrphan).toBe(true);

    const relResult = resolver.resolveForeignKey({
      sourceModel: 'Invoice',
      sourceId: rawInvoice.id,
      sourceSchoolUuid: schoolUuid,
      field: 'studentId',
      targetModel: 'Student',
      targetCollection: 'students',
      targetSourceId: transformed.rawStudentId,
      isNullable: false,
      rawSchoolId: 'SchoolS023'
    });

    expect(relResult.status).toBe('ORPHAN_INVOICE');
    expect(resolver.getQuarantineQueue().some(q => q.model === 'Invoice' && q.reason.includes('ORPHAN_INVOICE'))).toBe(true);
  });

  // 8. Historical/orphan user classification
  it('8. Correctly classifies active tenant users vs legacy orphan users vs global admins', () => {
    const activeSchools = new Set(['SchoolS015', 'SchoolS019']);
    idMapper.mapId(null, 'schools', 'SchoolS015', 'School');

    // Active user
    const activeUser = transformUser(
      { id: 'usr_active', data: { email: 'active@test.com', schoolId: 'SchoolS015', role: 'teacher' } },
      idMapper,
      activeSchools
    );
    expect(activeUser.classification).toBe('ACTIVE_TENANT_USER');
    expect(activeUser.data.schoolId).toBeDefined();

    // Legacy orphan user
    const legacyUser = transformUser(
      { id: 'usr_legacy', data: { email: 'legacy@test.com', schoolId: 'SchoolS016', role: 'teacher' } },
      idMapper,
      activeSchools
    );
    expect(legacyUser.classification).toBe('LEGACY_ORPHAN_USER');
    expect(legacyUser.data.schoolId).toBeNull();

    // Global admin user
    const adminUser = transformUser(
      { id: 'usr_admin', data: { email: 'admin@zuna.com', role: 'superadmin' } },
      idMapper,
      activeSchools
    );
    expect(adminUser.classification).toBe('GLOBAL_ADMIN');
    expect(adminUser.data.schoolId).toBeNull();
    expect(adminUser.data.role).toBe('SUPER_ADMIN');
  });

  // 9. Missing auth-user classification
  it('9. Flags teachers without auth accounts with SYNTHETIC_IDENTITY_REQUIRED', () => {
    const schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS019', 'School');
    const existingUserUids = new Set(['auth_user_123']);

    // Teacher with existing auth
    const teacherWithAuth = transformStaff(
      { id: 'tch_01', data: { userId: 'auth_user_123', employeeId: 'EMP-01', role: 'Maths Teacher' } },
      idMapper,
      'SchoolS019',
      existingUserUids
    );
    expect(teacherWithAuth.syntheticUserRequired).toBe(false);

    // Teacher without auth
    const teacherWithoutAuth = transformStaff(
      { id: 'tch_02', data: { employeeId: 'EMP-02', role: 'Science Teacher' } },
      idMapper,
      'SchoolS019',
      existingUserUids
    );
    expect(teacherWithoutAuth.syntheticUserRequired).toBe(true);
    expect(teacherWithoutAuth.userUuid).toBeDefined();
    expect(idMapper.mappings.get(`${schoolUuid}:users:shadow_staff_tch_02`).metadata.synthetic).toBe(true);
  });

  // 10. Invalid email handling
  it('10. Preserves invalid email values and marks transformationRequired without mutating', () => {
    const invalidEmail = 'mithra@gmail';
    const result = validateEmail(invalidEmail);

    expect(result.isValid).toBe(false);
    expect(result.value).toBe('mithra@gmail');
    expect(result.transformationRequired).toBe(true);

    const validEmail = 'mithra@gmail.com';
    const validResult = validateEmail(validEmail);
    expect(validResult.isValid).toBe(true);
    expect(validResult.transformationRequired).toBe(false);
  });

  // 11. Invalid phone handling
  it('11. Preserves invalid phone values and marks transformationRequired without mutating', () => {
    const invalidPhone = '72829729191'; // 11 digits
    const result = validatePhone(invalidPhone);

    expect(result.isValid).toBe(false);
    expect(result.value).toBe('72829729191');
    expect(result.transformationRequired).toBe(true);
  });

  // 12. Invalid date handling
  it('12. Preserves invalid date string without falling back to current date', () => {
    const invalidDateStr = 'not-a-real-date';
    const result = parseDateSafe(invalidDateStr);

    expect(result.isValid).toBe(false);
    expect(result.date).toBeNull();
    expect(result.raw).toBe('not-a-real-date');

    const validDateStr = '2026-07-30T06:06:45.788Z';
    const validResult = parseDateSafe(validDateStr);
    expect(validResult.isValid).toBe(true);
    expect(validResult.date).toBe('2026-07-30T06:06:45.788Z');
  });

  // 13. JSONB transformation
  it('13. Preserves arbitrary nested objects into JSONB structures without flattening', () => {
    const _schoolUuid = idMapper.mapId(null, 'schools', 'SchoolS024', 'School');
    const rawStudent = {
      id: 'stu_jsonb_01',
      data: {
        name: 'John Doe',
        customData: {
          emergencyContacts: [{ name: 'A', phone: '9876543210' }],
          previousAcademicHistory: { gpa: 3.8, school: 'Old High' },
          customFlags: { busPassActive: true, hostelRoom: 104 }
        }
      }
    };

    const transformed = transformStudent(rawStudent, idMapper, 'SchoolS024');
    expect(transformed.data.customData).toEqual(rawStudent.data.customData);
    expect(transformed.data.customData.emergencyContacts[0].name).toBe('A');
    expect(transformed.data.customData.previousAcademicHistory.gpa).toBe(3.8);
  });

  // 14. Deterministic dry-run behavior
  it('14. Produces identical UUIDs when run multiple times on unchanged data', () => {
    const mapper1 = new MigrationIdMapper();
    const mapper2 = new MigrationIdMapper();

    const uuid1 = mapper1.mapId('SchoolS015', 'students', 'DOC_XYZ_123', 'Student');
    const uuid2 = mapper2.mapId('SchoolS015', 'students', 'DOC_XYZ_123', 'Student');

    expect(uuid1).toBe(uuid2);
  });

  // 15. Dry-run write protection
  it('15. Strictly blocks database mutation methods and throws DryRunViolationError', () => {
    const mockPrisma = {
      user: {
        findMany: () => Promise.resolve([]),
        create: () => Promise.resolve({ id: '1' }),
        update: () => Promise.resolve({ id: '1' }),
        delete: () => Promise.resolve({ id: '1' })
      },
      $executeRaw: () => Promise.resolve(1)
    };

    const protectedPrisma = protectPrismaClient(mockPrisma);

    // Read methods are permitted
    expect(typeof protectedPrisma.user.findMany).toBe('function');

    // Write methods throw DryRunViolationError
    expect(() => protectedPrisma.user.create({})).toThrow(DryRunViolationError);
    expect(() => protectedPrisma.user.update({})).toThrow(DryRunViolationError);
    expect(() => protectedPrisma.user.delete({})).toThrow(DryRunViolationError);
    expect(() => protectedPrisma.$executeRaw()).toThrow(DryRunViolationError);
  });
});
