import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERROR_CODES } from '../../../src/config/constants.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../../src/modules/auth/password.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as admissionAuthService from '../../../src/modules/auth/admission-auth.service.js';

vi.mock('../../../src/modules/auth/auth.repository.js');
vi.mock('../../../src/modules/auth/password.service.js');
vi.mock('../../../src/modules/auth/token.service.js');
vi.mock('../../../src/modules/auth/session.service.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {},
  runWithTenantContext: vi.fn((ctx, fn) => fn())
}));

describe('Unit: AdmissionAuthService (authenticateByAdmissionNumber)', () => {
  const mockSchool = {
    id: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    name: 'Spring Mount Valley School',
    code: 'SchoolS024',
    status: 'approved'
  };

  const mockParentUser = {
    id: '87525430-ed28-4038-a74d-82e35a06529e',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'parent@s024.sms.internal',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$validhash',
    passwordAlgorithm: 'argon2id',
    systemRole: 'PARENT',
    tokenVersion: 1,
    isActive: true
  };

  const mockStudent = {
    id: '00944d2b-8fd3-49bc-b9bc-695f2b414cb0',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    admissionNumber: '539',
    firstName: 'Student',
    status: 'Active',
    parents: [
      {
        id: 'd971243d-6769-4ff0-93b8-08187fb1119d',
        relationship: 'Parent',
        parent: {
          id: 'c373e62c-b099-47b2-9887-202a81c8f4b6',
          schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
          userId: mockParentUser.id,
          user: mockParentUser
        }
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();

    authRepository.findSchoolByCode.mockResolvedValue(mockSchool);
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue(mockStudent);
    passwordService.isLockedPassword.mockReturnValue(false);
    passwordService.verifyPassword.mockResolvedValue(true);
    sessionService.createSession.mockResolvedValue({
      rawToken: 'a'.repeat(64),
      session: { id: 'session-uuid' }
    });
    tokenService.issueAccessToken.mockReturnValue('mock.jwt.token');
  });

  it('successfully authenticates with valid schoolCode, admissionNumber, and password', async () => {
    const result = await admissionAuthService.authenticateByAdmissionNumber({
      schoolCode: 'SchoolS024',
      admissionNumber: '539',
      password: 'SecurePassword123!',
      ipAddress: '127.0.0.1',
      deviceInfo: 'Mozilla/5.0'
    });

    expect(authRepository.findSchoolByCode).toHaveBeenCalledWith('SchoolS024');
    expect(authRepository.findStudentWithParentsByAdmissionNumber).toHaveBeenCalledWith(
      mockSchool.id,
      '539'
    );
    expect(passwordService.verifyPassword).toHaveBeenCalledWith(
      mockParentUser.passwordHash,
      'SecurePassword123!'
    );
    expect(sessionService.createSession).toHaveBeenCalledWith(mockParentUser, {
      ipAddress: '127.0.0.1',
      deviceInfo: 'Mozilla/5.0'
    });
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith({
      sub: mockParentUser.id,
      schoolId: mockParentUser.schoolId,
      systemRole: mockParentUser.systemRole,
      tokenVersion: mockParentUser.tokenVersion
    });

    expect(result).toEqual({
      accessToken: 'mock.jwt.token',
      rawRefreshToken: 'a'.repeat(64),
      user: {
        id: mockParentUser.id,
        email: mockParentUser.email,
        schoolId: mockParentUser.schoolId,
        systemRole: mockParentUser.systemRole
      }
    });
  });

  it('normalizes schoolCode and admissionNumber by trimming whitespace', async () => {
    await admissionAuthService.authenticateByAdmissionNumber({
      schoolCode: '  SchoolS024  ',
      admissionNumber: '  539  ',
      password: 'SecurePassword123!'
    });

    expect(authRepository.findSchoolByCode).toHaveBeenCalledWith('SchoolS024');
    expect(authRepository.findStudentWithParentsByAdmissionNumber).toHaveBeenCalledWith(
      mockSchool.id,
      '539'
    );
  });

  it('rejects missing parameters with INVALID_CREDENTIALS', async () => {
    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: '',
        admissionNumber: '539',
        password: 'pass'
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '',
        password: 'pass'
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: ''
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects nonexistent school with generic 401 INVALID_CREDENTIALS (enumeration resistance)', async () => {
    authRepository.findSchoolByCode.mockResolvedValue(null);

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'UnknownSchool',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects suspended school with 403 TENANT_ACCESS_ERROR', async () => {
    authRepository.findSchoolByCode.mockResolvedValue({
      ...mockSchool,
      status: 'suspended'
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ERROR_CODES.TENANT_ACCESS_ERROR
    });
  });

  it('rejects pending school with 403 TENANT_ACCESS_ERROR', async () => {
    authRepository.findSchoolByCode.mockResolvedValue({
      ...mockSchool,
      status: 'pending'
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ERROR_CODES.TENANT_ACCESS_ERROR
    });
  });

  it('rejects nonexistent student with generic 401 INVALID_CREDENTIALS', async () => {
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue(null);

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '999999',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects inactive student with generic 401 INVALID_CREDENTIALS', async () => {
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      status: 'Inactive'
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects student with no parent links with generic 401 INVALID_CREDENTIALS', async () => {
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: []
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects candidate parent with schoolId mismatch (tenant isolation)', async () => {
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: [
        {
          id: 'link-1',
          parent: {
            id: 'parent-1',
            schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
            user: {
              ...mockParentUser,
              schoolId: 'different-school-uuid'
            }
          }
        }
      ]
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('rejects candidate parent with SUPER_ADMIN systemRole', async () => {
    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: [
        {
          id: 'link-1',
          parent: {
            id: 'parent-1',
            schoolId: mockSchool.id,
            user: {
              ...mockParentUser,
              systemRole: 'SUPER_ADMIN'
            }
          }
        }
      ]
    });

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('returns 403 PASSWORD_NOT_SET when ALL linked candidate parent accounts are locked', async () => {
    passwordService.isLockedPassword.mockReturnValue(true);

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ERROR_CODES.PASSWORD_NOT_SET
    });
  });

  it('handles multi-parent: authenticates unlocked parent when one parent is locked and one is usable', async () => {
    const parent1Locked = {
      id: 'parent-user-1',
      schoolId: mockSchool.id,
      email: 'father@s024.sms.internal',
      passwordHash: '!LOCKED_PARENT_NO_DIRECT_AUTH',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    const parent2Unlocked = {
      id: 'parent-user-2',
      schoolId: mockSchool.id,
      email: 'mother@s024.sms.internal',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$validmotherhash',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: [
        {
          id: 'link-1',
          parent: { id: 'p-1', user: parent1Locked }
        },
        {
          id: 'link-2',
          parent: { id: 'p-2', user: parent2Unlocked }
        }
      ]
    });

    passwordService.isLockedPassword.mockImplementation((hash) => hash.startsWith('!LOCKED_'));
    passwordService.verifyPassword.mockResolvedValue(true);

    const result = await admissionAuthService.authenticateByAdmissionNumber({
      schoolCode: 'SchoolS024',
      admissionNumber: '539',
      password: 'MotherSecurePassword123!'
    });

    expect(result.user.id).toBe(parent2Unlocked.id);
    expect(result.user.email).toBe(parent2Unlocked.email);
  });

  it('handles multi-parent: returns generic 401 INVALID_CREDENTIALS when one parent is locked and password fails for usable parent', async () => {
    const parent1Locked = {
      id: 'parent-user-1',
      schoolId: mockSchool.id,
      email: 'father@s024.sms.internal',
      passwordHash: '!LOCKED_PARENT_NO_DIRECT_AUTH',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    const parent2Unlocked = {
      id: 'parent-user-2',
      schoolId: mockSchool.id,
      email: 'mother@s024.sms.internal',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$validmotherhash',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: [
        {
          id: 'link-1',
          parent: { id: 'p-1', user: parent1Locked }
        },
        {
          id: 'link-2',
          parent: { id: 'p-2', user: parent2Unlocked }
        }
      ]
    });

    passwordService.isLockedPassword.mockImplementation((hash) => hash.startsWith('!LOCKED_'));
    passwordService.verifyPassword.mockResolvedValue(false); // Password does not match

    await expect(
      admissionAuthService.authenticateByAdmissionNumber({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'WrongPassword!'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
  });

  it('handles multi-parent: correctly selects matching parent when multiple usable parent accounts exist', async () => {
    const father = {
      id: 'father-uuid',
      schoolId: mockSchool.id,
      email: 'father@s024.sms.internal',
      passwordHash: '$argon2id$v=19$fatherhash',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    const mother = {
      id: 'mother-uuid',
      schoolId: mockSchool.id,
      email: 'mother@s024.sms.internal',
      passwordHash: '$argon2id$v=19$motherhash',
      systemRole: 'PARENT',
      tokenVersion: 1,
      isActive: true
    };

    authRepository.findStudentWithParentsByAdmissionNumber.mockResolvedValue({
      ...mockStudent,
      parents: [
        { id: 'link-1', parent: { id: 'p-1', user: father } },
        { id: 'link-2', parent: { id: 'p-2', user: mother } }
      ]
    });

    passwordService.isLockedPassword.mockReturnValue(false);
    // Mother's password matches
    passwordService.verifyPassword.mockImplementation(async (hash, pass) => {
      return hash === mother.passwordHash && pass === 'MotherPassword123!';
    });

    const result = await admissionAuthService.authenticateByAdmissionNumber({
      schoolCode: 'SchoolS024',
      admissionNumber: '539',
      password: 'MotherPassword123!'
    });

    expect(result.user.id).toBe(mother.id);
    expect(result.user.email).toBe(mother.email);
  });
});
