import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as parentService from '../../../src/modules/parents/parent.service.js';
import * as parentRepository from '../../../src/modules/parents/parent.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/parents/parent.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    student: {
      findFirst: vi.fn()
    },
    school: {
      findUnique: vi.fn()
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    parentProfile: {
      create: vi.fn()
    },
    parentStudentLink: {
      create: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Parent Concurrency & Transaction Integrity', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PARENT_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const ACTOR = {
    userId: '44444444-4444-4444-8444-444444444444',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID, firstName: 'Alice' });
    parentRepository.findParentById.mockResolvedValue({ id: PARENT_ID, schoolId: SCHOOL_ID, name: 'Parent A' });
    parentRepository.findParentByEmail.mockResolvedValue(null);
    parentRepository.findParentByPhone.mockResolvedValue(null);
    prisma.school.findUnique.mockResolvedValue({ code: 'SchoolS024' });
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
  });

  it('catches concurrent duplicate link insertion and throws ConflictError', async () => {
    parentRepository.findParentStudentLink.mockResolvedValue(null);
    parentRepository.createParentStudentLink.mockRejectedValue(new ConflictError('Parent is already linked to this student'));

    await expect(parentService.linkParentToStudent(
      SCHOOL_ID,
      STUDENT_ID,
      { parentProfileId: PARENT_ID, relationship: 'Father' },
      ACTOR
    )).rejects.toThrow(ConflictError);

    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('aborts transaction and throws ConflictError when duplicate email is concurrently registered', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(new ConflictError('Email address is already in use'));

    await expect(parentService.linkParentToStudent(
      SCHOOL_ID,
      STUDENT_ID,
      { name: 'John Doe', email: 'john@example.com', relationship: 'Father' },
      ACTOR
    )).rejects.toThrow(ConflictError);

    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('safely rejects concurrent unlink if link has already been deleted', async () => {
    parentRepository.findParentStudentLink.mockResolvedValue(null); // Already deleted by concurrent request

    await expect(parentService.unlinkParentFromStudent(
      SCHOOL_ID,
      STUDENT_ID,
      PARENT_ID,
      ACTOR
    )).rejects.toThrow(NotFoundError);

    expect(parentRepository.deleteParentStudentLink).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });
});
