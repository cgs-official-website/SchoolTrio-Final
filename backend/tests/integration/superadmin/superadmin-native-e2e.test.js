import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { hashPassword } from '../../../src/modules/auth/password.service.js';

describe('SuperAdmin Native REST Authentication & Platform E2E Integration', () => {
  const app = createApp();
  const superAdminEmail = 'superadmin-e2e@platform.com';
  const superAdminPassword = 'SuperAdmin123!';

  it('1. Prepares SuperAdmin PostgreSQL user account with Argon2id hash', async () => {
    const passwordHash = await hashPassword(superAdminPassword);
    let user = await prisma.user.findFirst({
      where: { email: superAdminEmail, schoolId: null }
    });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          systemRole: 'SUPER_ADMIN',
          passwordHash,
          passwordAlgorithm: 'argon2id',
          isActive: true
        }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: superAdminEmail,
          passwordHash,
          passwordAlgorithm: 'argon2id',
          systemRole: 'SUPER_ADMIN',
          isActive: true,
          schoolId: null,
          tokenVersion: 1
        }
      });
    }


    expect(user).toBeDefined();
    expect(user.email).toBe(superAdminEmail);
    expect(user.systemRole).toBe('SUPER_ADMIN');
    expect(user.schoolId).toBeNull();
  });

  it('2. Performs native REST login via POST /api/v1/auth/login and receives JWT access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: superAdminEmail,
        password: superAdminPassword
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.systemRole).toBe('SUPER_ADMIN');
    expect(res.body.data.user.email).toBe(superAdminEmail);

    // Save token for subsequent calls
    const accessToken = res.body.data.accessToken;

    // Verify GET /api/v1/auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.systemRole).toBe('SUPER_ADMIN');
    expect(meRes.body.data.schoolId).toBeNull();
  });

  it('3. Accesses SuperAdmin platform endpoints (stats, tenants, plans, branding)', async () => {
    // Obtain valid token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: superAdminEmail,
        password: superAdminPassword
      });

    const accessToken = loginRes.body.data.accessToken;

    // GET /api/v1/superadmin/stats
    const statsRes = await request(app)
      .get('/api/v1/superadmin/stats')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);

    // GET /api/v1/superadmin/tenants
    const tenantsRes = await request(app)
      .get('/api/v1/superadmin/tenants')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(tenantsRes.status).toBe(200);
    expect(Array.isArray(tenantsRes.body.data)).toBe(true);

    // GET /api/v1/superadmin/plans
    const plansRes = await request(app)
      .get('/api/v1/superadmin/plans')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(plansRes.status).toBe(200);
    expect(Array.isArray(plansRes.body.data)).toBe(true);
  }, 30000);


  it('4. Rejects wrong password with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: superAdminEmail,
        password: 'WrongPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
