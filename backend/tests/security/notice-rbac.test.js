import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireNoticeCreateOrTeacher,
  requireNoticeEditOrTeacher,
  requireNoticeDeleteOrTeacher
} from '../../src/modules/notices/notice.routes.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import * as rbacMiddleware from '../../src/middleware/rbac.middleware.js';

describe('Security: Notice RBAC Route Gates Tests — Backend Notice Domain', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('1. requireNoticeCreateOrTeacher', () => {
    it('bypasses permission check for authentic Teacher role', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.TEACHER,
          role: 'TEACHER'
        }
      };

      requireNoticeCreateOrTeacher(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('delegates to requirePermission("noticeboard", "create") for non-teacher roles', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.STAFF,
          role: 'STAFF'
        }
      };

      const spyRequirePerm = vi.spyOn(rbacMiddleware, 'requirePermission').mockReturnValue((_req, _res, next) => next());

      requireNoticeCreateOrTeacher(mockReq, mockRes, mockNext);
      expect(spyRequirePerm).toHaveBeenCalledWith('noticeboard', 'create');
    });
  });

  describe('2. requireNoticeEditOrTeacher', () => {
    it('bypasses permission check for authentic Teacher role', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.TEACHER,
          role: 'TEACHER'
        }
      };

      requireNoticeEditOrTeacher(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('delegates to requirePermission("noticeboard", "edit") for non-teacher roles', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.STAFF,
          role: 'STAFF'
        }
      };

      const spyRequirePerm = vi.spyOn(rbacMiddleware, 'requirePermission').mockReturnValue((_req, _res, next) => next());

      requireNoticeEditOrTeacher(mockReq, mockRes, mockNext);
      expect(spyRequirePerm).toHaveBeenCalledWith('noticeboard', 'edit');
    });
  });

  describe('3. requireNoticeDeleteOrTeacher', () => {
    it('bypasses permission check for authentic Teacher role', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.TEACHER,
          role: 'TEACHER'
        }
      };

      requireNoticeDeleteOrTeacher(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('delegates to requirePermission("noticeboard", "delete") for non-teacher roles', () => {
      mockReq = {
        auth: {
          systemRole: SYSTEM_ROLES.PARENT,
          role: 'PARENT'
        }
      };

      const spyRequirePerm = vi.spyOn(rbacMiddleware, 'requirePermission').mockReturnValue((_req, _res, next) => next());

      requireNoticeDeleteOrTeacher(mockReq, mockRes, mockNext);
      expect(spyRequirePerm).toHaveBeenCalledWith('noticeboard', 'delete');
    });
  });
});
