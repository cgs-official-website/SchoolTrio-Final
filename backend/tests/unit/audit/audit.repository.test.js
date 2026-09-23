import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Unit: Canonical AuditLog Repository', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully creates an audit log entry with full metadata', async () => {
    const mockAuditLog = {
      id: 'audit-1',
      schoolId: SCHOOL_ID,
      entityType: 'Class',
      entityId: ENTITY_ID,
      actionPerformed: 'CREATE_CLASS: Grade 10',
      userName: 'admin@school.edu',
      userRole: 'SCHOOL_ADMIN',
      modifiedFields: { name: 'Grade 10' },
      timestamp: new Date()
    };

    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue(mockAuditLog);

    const result = await auditRepository.createAuditLog({
      schoolId: SCHOOL_ID,
      entityType: 'Class',
      entityId: ENTITY_ID,
      actionPerformed: 'CREATE_CLASS: Grade 10',
      userName: 'admin@school.edu',
      userRole: 'SCHOOL_ADMIN',
      modifiedFields: { name: 'Grade 10' }
    });

    expect(result).toEqual(mockAuditLog);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: ENTITY_ID,
        actionPerformed: 'CREATE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: { name: 'Grade 10' }
      }
    });
  });

  it('rejects audit log creation and returns null when schoolId is missing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prismaSpy = vi.spyOn(prisma.auditLog, 'create');

    const result = await auditRepository.createAuditLog({
      entityType: 'Class',
      actionPerformed: 'CREATE_CLASS: Grade 10'
    });

    expect(result).toBeNull();
    expect(prismaSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT LOG WARNING] Failed to record audit log: schoolId is required')
    );
  });

  it('is non-blocking: catches database failure, logs warning, and returns null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(prisma.auditLog, 'create').mockRejectedValue(new Error('Database connection failure'));

    const result = await auditRepository.createAuditLog({
      schoolId: SCHOOL_ID,
      entityType: 'Class',
      actionPerformed: 'CREATE_CLASS: Grade 10'
    });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT LOG WARNING] Failed to record audit log:'),
      'Database connection failure'
    );
  });

  it('supports custom transaction client tx', async () => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'tx-audit-1' })
      }
    };

    const result = await auditRepository.createAuditLog(
      {
        schoolId: SCHOOL_ID,
        entityType: 'Section',
        actionPerformed: 'CREATE_SECTION: Grade 10 - Section A'
      },
      mockTx
    );

    expect(result).toEqual({ id: 'tx-audit-1' });
    expect(mockTx.auditLog.create).toHaveBeenCalled();
  });
});
