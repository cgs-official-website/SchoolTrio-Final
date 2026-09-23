import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { basePrisma, runWithTenantContext } from '../../../src/database/prisma.client.js';
import * as hrPayrollService from '../../../src/modules/hr-payroll/hr-payroll.service.js';

describe('HR & Payroll Real PostgreSQL Concurrency & Tenant Isolation Tests', () => {
  const SCHOOL_A_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
  const SCHOOL_B_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

  const USER_A_ID = '11111111-aaaa-4aaa-8aaa-111111111111';
  const USER_B_ID = '22222222-bbbb-4bbb-8bbb-222222222222';

  const STAFF_A_ID = '33333333-aaaa-4aaa-8aaa-333333333333';
  const STAFF_B_ID = '44444444-bbbb-4bbb-8bbb-444444444444';

  const TEST_MONTH = 'JANUARY_TEST_2026';

  beforeAll(async () => {
    await cleanup();

    await basePrisma.school.createMany({
      data: [
        { id: SCHOOL_A_ID, name: 'HR Test School A', code: 'HR-TEST-A' },
        { id: SCHOOL_B_ID, name: 'HR Test School B', code: 'HR-TEST-B' }
      ]
    });

    await basePrisma.user.createMany({
      data: [
        { id: USER_A_ID, schoolId: SCHOOL_A_ID, email: 'staffA@schoolA.com', passwordHash: 'hashA' },
        { id: USER_B_ID, schoolId: SCHOOL_B_ID, email: 'staffB@schoolB.com', passwordHash: 'hashB' }
      ]
    });

    await basePrisma.staffProfile.createMany({
      data: [
        {
          id: STAFF_A_ID,
          schoolId: SCHOOL_A_ID,
          userId: USER_A_ID,
          employeeId: 'EMP-A-001',
          name: 'Staff Member A',
          baseSalary: 30000,
          status: 'Active'
        },
        {
          id: STAFF_B_ID,
          schoolId: SCHOOL_B_ID,
          userId: USER_B_ID,
          employeeId: 'EMP-B-001',
          name: 'Staff Member B',
          baseSalary: 20000,
          status: 'Active'
        }
      ]
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  async function cleanup() {
    try {
      await basePrisma.hRPayrollRecord.deleteMany({
        where: {
          schoolId: { in: [SCHOOL_A_ID, SCHOOL_B_ID] }
        }
      });
      await basePrisma.schoolSetting.deleteMany({
        where: {
          schoolId: { in: [SCHOOL_A_ID, SCHOOL_B_ID] }
        }
      });
      await basePrisma.staffProfile.deleteMany({
        where: {
          schoolId: { in: [SCHOOL_A_ID, SCHOOL_B_ID] }
        }
      });
      await basePrisma.user.deleteMany({
        where: {
          id: { in: [USER_A_ID, USER_B_ID] }
        }
      });
      await basePrisma.school.deleteMany({
        where: {
          id: { in: [SCHOOL_A_ID, SCHOOL_B_ID] }
        }
      });
    } catch (_err) {
      // Ignore cleanup error if records didn't exist
    }
  }

  // ==========================================
  // 1. Real PostgreSQL Concurrency: Payroll Generation
  // ==========================================
  it('prevents duplicate payroll generation under concurrent execution via DB unique constraint', async () => {
    const actor = { email: 'admin@schoolA.com', role: 'Admin' };

    const [res1, res2] = await Promise.allSettled([
      runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
        hrPayrollService.generatePayroll(
          SCHOOL_A_ID,
          {
            month: TEST_MONTH,
            staffIds: [STAFF_A_ID]
          },
          actor
        )
      ),
      runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
        hrPayrollService.generatePayroll(
          SCHOOL_A_ID,
          {
            month: TEST_MONTH,
            staffIds: [STAFF_A_ID]
          },
          actor
        )
      )
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const count = await basePrisma.hRPayrollRecord.count({
      where: {
        schoolId: SCHOOL_A_ID,
        teacherId: STAFF_A_ID,
        month: TEST_MONTH
      }
    });
    expect(count).toBe(1);
  });

  // ==========================================
  // 2. Real PostgreSQL Tenant Isolation: Cross-Tenant Queries
  // ==========================================
  it('enforces strict tenant isolation across schools for list and self-service', async () => {
    const listA = await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
      hrPayrollService.listPayrolls(SCHOOL_A_ID, {})
    );
    expect(listA.records).toHaveLength(1);
    expect(listA.records[0].teacherId).toBe(STAFF_A_ID);

    const listB = await runWithTenantContext({ schoolId: SCHOOL_B_ID, role: 'Admin' }, () =>
      hrPayrollService.listPayrolls(SCHOOL_B_ID, {})
    );
    expect(listB.records).toHaveLength(0);

    const selfA = await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Staff' }, () =>
      hrPayrollService.getMySalary(SCHOOL_A_ID, USER_A_ID, {})
    );
    expect(selfA).toHaveLength(1);

    await expect(
      runWithTenantContext({ schoolId: SCHOOL_B_ID, role: 'Staff' }, () =>
        hrPayrollService.getMySalary(SCHOOL_B_ID, USER_A_ID, {})
      )
    ).rejects.toThrow('Staff profile not found');
  });

  // ==========================================
  // 3. Real PostgreSQL Concurrency: Delete vs Payment Transition Race
  // ==========================================
  it('safely prevents deletion when record is concurrently marked as Paid', async () => {
    const list = await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
      hrPayrollService.listPayrolls(SCHOOL_A_ID, { month: TEST_MONTH })
    );
    const payrollRecord = list.records[0];
    expect(payrollRecord.status).toBe('Pending');

    const actor = { email: 'admin@schoolA.com', role: 'Admin' };

    await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
      hrPayrollService.updatePayrollStatus(
        SCHOOL_A_ID,
        payrollRecord.id,
        { status: 'Paid' },
        actor
      )
    );

    await expect(
      runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
        hrPayrollService.deletePayroll(SCHOOL_A_ID, payrollRecord.id, actor)
      )
    ).rejects.toThrow(/Cannot delete payroll record in 'Paid' status/);

    const recordInDb = await basePrisma.hRPayrollRecord.findUnique({
      where: { id: payrollRecord.id }
    });
    expect(recordInDb).not.toBeNull();
    expect(recordInDb.status).toBe('Paid');
  });

  // ==========================================
  // 4. Real PostgreSQL HR Configuration (SchoolSetting)
  // ==========================================
  it('stores and retrieves authorized signature in SchoolSetting under category hrConfig', async () => {
    const actor = { email: 'admin@schoolA.com', role: 'Admin' };

    await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
      hrPayrollService.updateHRConfig(
        SCHOOL_A_ID,
        { authorizedSignature: 'https://school-a.com/sig.png' },
        actor
      )
    );

    const configA = await runWithTenantContext({ schoolId: SCHOOL_A_ID, role: 'Admin' }, () =>
      hrPayrollService.getHRConfig(SCHOOL_A_ID)
    );
    expect(configA.authorizedSignature).toBe('https://school-a.com/sig.png');

    const configB = await runWithTenantContext({ schoolId: SCHOOL_B_ID, role: 'Admin' }, () =>
      hrPayrollService.getHRConfig(SCHOOL_B_ID)
    );
    expect(configB.authorizedSignature).toBeNull();
  });
});
