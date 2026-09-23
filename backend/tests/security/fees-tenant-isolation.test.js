import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as feeService from '../../src/modules/fees/fee.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError, RelationshipConflictError } from '../../src/utils/app-error.js';

describe('Security: Fee Domain Tenant Isolation & Authorization — Phase 4C.6-A', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const PERIOD_A = '33333333-3333-4333-8333-333333333333';
  const FEE_STRUCTURE_A = '44444444-4444-4444-8444-444444444444';
  const CLASS_A = '55555555-5555-4555-8555-555555555555';

  const ADMIN_A_ID = '77777777-7777-4777-8777-777777777777';
  const ADMIN_B_ID = '88888888-8888-4888-8888-888888888888';

  const adminTenantA = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Tenant A School', code: 'SchoolA', status: 'active' }
  };

  const adminTenantB = {
    id: ADMIN_B_ID,
    schoolId: TENANT_B,
    email: 'admin@tenantb.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B, name: 'Tenant B School', code: 'SchoolB', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Cross-Tenant Read & Write Isolation', () => {
    it('returns 404 when Tenant B attempts to read a FeeCollectionPeriod from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(feeService, 'getCollectionPeriodById').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_A && id === PERIOD_A) {
          return { id: PERIOD_A, schoolId: TENANT_A };
        }
        throw new NotFoundError('Fee collection period');
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/fee-collection-periods/${PERIOD_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Tenant B attempts to read a FeeStructure from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(feeService, 'getFeeStructureById').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_A && id === FEE_STRUCTURE_A) {
          return { id: FEE_STRUCTURE_A, schoolId: TENANT_A };
        }
        throw new NotFoundError('Fee structure');
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/fee-structures/${FEE_STRUCTURE_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Tenant B attempts to update or delete a FeeStructure from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(feeService, 'updateFeeStructure').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_B && id === FEE_STRUCTURE_A) {
          throw new NotFoundError('Fee structure');
        }
        return {};
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .patch(`/api/v1/fee-structures/${FEE_STRUCTURE_A}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ amount: 60000 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Cross-Tenant Reference Protection', () => {
    it('rejects FeeStructure creation when Tenant B references a Class belonging to Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(feeService, 'createFeeStructure').mockRejectedValue(
        new RelationshipConflictError('Target class does not exist in this school tenant')
      );

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Class Fee',
          amount: 5000,
          dueDate: '2026-10-15',
          classId: CLASS_A // belongs to Tenant A
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects FeeStructure creation when Tenant B references a FeeCollectionPeriod belonging to Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(feeService, 'createFeeStructure').mockRejectedValue(
        new RelationshipConflictError('Fee collection period does not exist in this school tenant')
      );

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Class Fee',
          amount: 5000,
          dueDate: '2026-10-15',
          classId: '22222222-2222-4222-8222-222222222222',
          collectionPeriodId: PERIOD_A // belongs to Tenant A
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Tenant Parameter Poisoning Protection', () => {
    it('rejects request with conflicting schoolId passed in request body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .post('/api/v1/fee-collection-periods')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          schoolId: TENANT_B, // Poison attempt
          name: 'Term 1',
          dueDate: '2026-10-15'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
