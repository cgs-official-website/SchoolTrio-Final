import * as noticeRepository from './notice.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Normalizes and formats a database Notice record for canonical API output.
 *
 * @param {Object} notice - Database Notice record
 * @returns {Object} Canonical notice object
 */
export function formatNoticeResponse(notice) {
  if (!notice) return null;

  const rawAttachments = notice.attachments;
  let priority = 'normal';
  let authorId = null;
  let authorName = 'Administrator';
  let targetStudentIds = [];
  let files = [];

  if (rawAttachments && typeof rawAttachments === 'object' && !Array.isArray(rawAttachments)) {
    if (rawAttachments.priority) priority = rawAttachments.priority;
    if (rawAttachments.authorId) authorId = rawAttachments.authorId;
    if (rawAttachments.authorName) authorName = rawAttachments.authorName;
    if (Array.isArray(rawAttachments.targetStudentIds)) targetStudentIds = rawAttachments.targetStudentIds;
    if (Array.isArray(rawAttachments.files)) files = rawAttachments.files;
  } else if (Array.isArray(rawAttachments)) {
    files = rawAttachments;
  }

  return {
    id: notice.id,
    schoolId: notice.schoolId,
    title: notice.title,
    content: notice.content,
    message: notice.content, // Compatibility alias
    type: notice.type || 'global',
    classId: notice.classId || null,
    className: notice.class?.name || null,
    audience: notice.audience || 'all',
    priority,
    authorId,
    authorName,
    targetStudentIds,
    viewedBy: Array.isArray(notice.viewedBy) ? notice.viewedBy : [],
    attachments: files,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt
  };
}

/**
 * Resolves the author display name from actor context and tenant database.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<{ authorId: string, authorName: string }>}
 */
async function resolveActorIdentity(schoolId, actor) {
  const userId = actor.userId || actor.id;
  let authorName = actor.name || actor.email || 'Administrator';

  // Check StaffProfile
  const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
  if (staffProfile) {
    const fn = (staffProfile.firstName || staffProfile.customData?.firstName || '').trim();
    const ln = (staffProfile.lastName || staffProfile.customData?.lastName || '').trim();
    const constructedName = (fn || ln) ? `${fn} ${ln}`.trim() : null;
    const fullName = constructedName || staffProfile.name;
    if (fullName) {
      authorName = fullName;
    }
  }

  return {
    authorId: userId,
    authorName
  };
}

/**
 * Resolves the viewer display name and role from actor context and tenant database.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<{ name: string, role: string, classId: string }>}
 */
export async function resolveViewerIdentity(schoolId, userId, actor = {}) {
  const role = (actor.systemRole || actor.role || '').toUpperCase();
  let name = null;
  let displayRole = actor.systemRole || actor.role || 'User';
  let classId = '';

  // 1. Staff / Teacher Lookup
  const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
  if (staffProfile) {
    const fn = (staffProfile.firstName || staffProfile.customData?.firstName || '').trim();
    const ln = (staffProfile.lastName || staffProfile.customData?.lastName || '').trim();
    const constructedName = (fn || ln) ? `${fn} ${ln}`.trim() : null;
    name = constructedName || staffProfile.name;
    classId = staffProfile.assignedClassId || '';
    if (staffProfile.designation) {
      displayRole = staffProfile.designation;
    } else if (staffProfile.staffType === 'teaching' || role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
      displayRole = 'Teacher';
    } else {
      displayRole = 'Staff';
    }
  }

  // 2. Parent Lookup
  if (!name && (role === SYSTEM_ROLES.PARENT || role === 'PARENT' || actor.parentProfile)) {
    const parentProfile = await noticeRepository.findParentProfileByUserId(schoolId, userId);
    if (parentProfile) {
      name = parentProfile.name;
      displayRole = 'Parent';
      const { classIds } = await noticeRepository.findParentStudentsAndClasses(schoolId, userId);
      classId = classIds[0] || '';
    }
  }

  // 3. Student Lookup
  if (!name && (role === SYSTEM_ROLES.STUDENT || role === 'STUDENT')) {
    const student = await noticeRepository.findStudentByUserId(schoolId, userId);
    if (student) {
      const fn = (student.firstName || '').trim();
      const ln = (student.lastName || '').trim();
      name = `${fn} ${ln}`.trim() || student.firstName;
      classId = student.classId || '';
      displayRole = 'Student';
    }
  }

  // 4. Admin / Principal / Explicit Actor Name Fallback
  if (!name) {
    if (role === SYSTEM_ROLES.SUPER_ADMIN || role === 'SUPER_ADMIN' || role === 'SUPERADMIN') {
      displayRole = 'Super Admin';
    } else if (role === SYSTEM_ROLES.SCHOOL_ADMIN || role === 'SCHOOL_ADMIN' || role === 'ADMIN') {
      displayRole = 'Administrator';
    } else if (role === SYSTEM_ROLES.PRINCIPAL || role === 'PRINCIPAL') {
      displayRole = 'Principal';
    }

    if (actor.name && actor.name !== 'User' && actor.name !== 'user') {
      name = actor.name;
    }
  }

  // 5. User Email Fallback (capitalized email prefix if no profile)
  if (!name) {
    const user = await noticeRepository.findUserById(schoolId, userId);
    if (user?.email) {
      const emailPrefix = user.email.split('@')[0];
      name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
  }

  return {
    name: name || 'Staff Member',
    role: displayRole,
    classId
  };
}

/**
 * Batches identity resolution for viewers across multiple notices to eliminate N+1 queries and resolve historical "User" receipts.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<Object>} notices - Array of database Notice records
 * @returns {Promise<Array<Object>>} Notices with enriched viewedBy arrays
 */
export async function batchEnrichNoticeViewers(schoolId, notices) {
  if (!notices || !Array.isArray(notices) || notices.length === 0) return notices;

  const userIdsToResolve = new Set();
  const studentIdsToResolve = new Set();

  for (const notice of notices) {
    const viewers = Array.isArray(notice?.viewedBy) ? notice.viewedBy : [];
    for (const v of viewers) {
      if (!v) continue;
      const uid = v.uid || v.userId || v.parentUserId;
      if (uid && (!v.name || v.name === 'User' || v.name === 'user')) {
        userIdsToResolve.add(uid);
      }
      if (v.studentId) {
        studentIdsToResolve.add(v.studentId);
      }
    }
  }

  const [staffProfiles, parentProfiles, students, users, linkedStudents] = await Promise.all([
    userIdsToResolve.size > 0 ? noticeRepository.findStaffProfilesByUserIds(schoolId, Array.from(userIdsToResolve)) : [],
    userIdsToResolve.size > 0 ? noticeRepository.findParentProfilesByUserIds(schoolId, Array.from(userIdsToResolve)) : [],
    userIdsToResolve.size > 0 ? noticeRepository.findStudentsByUserIds(schoolId, Array.from(userIdsToResolve)) : [],
    userIdsToResolve.size > 0 ? noticeRepository.findUsersByIds(schoolId, Array.from(userIdsToResolve)) : [],
    studentIdsToResolve.size > 0 ? noticeRepository.findStudentsByUserIds(schoolId, Array.from(studentIdsToResolve)) : []
  ]);

  const identityMap = new Map();
  const studentMap = new Map();

  for (const s of (staffProfiles || [])) {
    const fn = (s.firstName || s.customData?.firstName || '').trim();
    const ln = (s.lastName || s.customData?.lastName || '').trim();
    const constructedName = (fn || ln) ? `${fn} ${ln}`.trim() : null;
    const name = constructedName || s.name;
    if (name && s.userId) {
      identityMap.set(s.userId, {
        name,
        role: s.designation || (s.staffType === 'teaching' ? 'Teacher' : 'Staff'),
        classId: s.assignedClassId || ''
      });
    }
  }

  for (const p of (parentProfiles || [])) {
    if (p.name && p.userId && !identityMap.has(p.userId)) {
      identityMap.set(p.userId, {
        name: p.name,
        role: 'Parent',
        classId: ''
      });
    }
  }

  for (const st of (students || [])) {
    const fn = (st.firstName || '').trim();
    const ln = (st.lastName || '').trim();
    const name = `${fn} ${ln}`.trim();
    const key = st.userId || st.id;
    if (name && key && !identityMap.has(key)) {
      identityMap.set(key, {
        name,
        role: 'Student',
        classId: st.classId || ''
      });
    }
  }

  for (const st of (linkedStudents || [])) {
    const fn = (st.firstName || '').trim();
    const ln = (st.lastName || '').trim();
    const name = `${fn} ${ln}`.trim();
    if (st.id) {
      studentMap.set(st.id, {
        id: st.id,
        name,
        classId: st.classId || ''
      });
    }
  }

  for (const u of (users || [])) {
    if (u.id && !identityMap.has(u.id)) {
      const emailPrefix = u.email ? u.email.split('@')[0] : 'User';
      const formattedName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      identityMap.set(u.id, {
        name: formattedName,
        role: u.systemRole === 'SCHOOL_ADMIN' ? 'Administrator' : (u.systemRole === 'TEACHER' ? 'Teacher' : u.systemRole || 'User'),
        classId: ''
      });
    }
  }

  for (const notice of notices) {
    if (Array.isArray(notice.viewedBy)) {
      notice.viewedBy = notice.viewedBy.map((v) => {
        if (!v) return v;
        const uid = v.uid || v.userId || v.parentUserId;
        const resolved = uid ? identityMap.get(uid) : null;
        const resolvedStudent = v.studentId ? studentMap.get(v.studentId) : null;

        let name = v.name;
        let role = v.role;
        let classId = v.classId;

        if (resolvedStudent) {
          if (!classId && resolvedStudent.classId) {
            classId = resolvedStudent.classId;
          }
          const studentName = resolvedStudent.name;
          if (v.role === 'parent' || resolved?.role === 'Parent') {
            const parentName = resolved?.name || v.parentName || (name && !name.startsWith('User') ? name.split(' (')[0] : 'Parent');
            if (parentName && studentName && parentName.toLowerCase() !== studentName.toLowerCase()) {
              name = `${parentName} (${studentName})`;
            } else {
              name = studentName || parentName;
            }
          }
        }

        if (!name || name === 'User' || name === 'user') {
          if (resolved) {
            name = resolved.name;
            role = resolved.role || role || 'Staff';
            classId = classId || resolved.classId;
          }
        }

        return {
          ...v,
          name: name || 'Staff Member',
          role: role || 'Member',
          classId: classId || ''
        };
      });
    }
  }

  return notices;
}

/**
 * Lists notices for the authenticated user, applying strict tenant isolation and role-specific visibility rules.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query and pagination parameters
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<{ notices: Array, pagination: Object }>}
 */
export async function listNotices(schoolId, query = {}, actor = {}) {
  const systemRole = (actor.systemRole || actor.role || '').toUpperCase();
  const userId = actor.userId || actor.id;

  const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
  const isSchoolAdmin = systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN);
  const isPrincipal = systemRole === SYSTEM_ROLES.PRINCIPAL || actor.roles?.includes(SYSTEM_ROLES.PRINCIPAL);

  // 1. Institutional Admins / Staff with full noticeboard permission have unfiltered visibility within tenant
  if (isSuperAdmin || isSchoolAdmin || isPrincipal) {
    const { notices, total } = await noticeRepository.findNoticesList(schoolId, query);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const page = Math.max(1, Number(query.page) || 1);
    const enrichedNotices = await batchEnrichNoticeViewers(schoolId, notices);

    return {
      notices: enrichedNotices.map(formatNoticeResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // 2. Teacher & Staff Visibility
  const isTeacherOrStaff =
    systemRole === SYSTEM_ROLES.TEACHER ||
    systemRole === SYSTEM_ROLES.STAFF ||
    systemRole === 'TENANT_USER' ||
    actor.roles?.includes(SYSTEM_ROLES.TEACHER) ||
    actor.roles?.includes(SYSTEM_ROLES.STAFF) ||
    Boolean(actor.staffProfile);

  if (isTeacherOrStaff && systemRole !== SYSTEM_ROLES.PARENT) {
    const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
    const assignedClassId = staffProfile?.assignedClassId || null;
    const headedClassIds = staffProfile?.headedClasses?.map((c) => c.id) || [];
    const teacherClassIds = [assignedClassId, ...headedClassIds].filter(Boolean);

    // Build teacher visibility conditions
    const teacherConditions = [
      {
        type: 'global',
        audience: { in: ['all', 'teachers'] }
      }
    ];

    if (teacherClassIds.length > 0) {
      teacherConditions.push({
        type: 'class',
        classId: { in: teacherClassIds }
      });
    } else if (query.classId) {
      teacherConditions.push({
        type: 'class',
        classId: query.classId
      });
    } else {
      teacherConditions.push({
        type: 'class'
      });
    }

    // Combine with requested query filters
    const customWhere = {
      OR: teacherConditions
    };

    const { notices, total } = await noticeRepository.findNoticesList(schoolId, {
      ...query,
      customWhere
    });

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const page = Math.max(1, Number(query.page) || 1);
    const enrichedNotices = await batchEnrichNoticeViewers(schoolId, notices);

    return {
      notices: enrichedNotices.map(formatNoticeResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // 3. Parent Visibility
  if (systemRole === SYSTEM_ROLES.PARENT || actor.roles?.includes(SYSTEM_ROLES.PARENT)) {
    const { studentIds, classIds } = await noticeRepository.findParentStudentsAndClasses(schoolId, userId);

    const parentConditions = [
      {
        type: 'global',
        audience: { in: ['all', 'parents', 'students_parents'] }
      }
    ];

    if (classIds.length > 0) {
      parentConditions.push({
        type: 'class',
        classId: { in: classIds }
      });
    }

    const { notices: rawNotices, total } = await noticeRepository.findNoticesList(schoolId, {
      ...query,
      customWhere: {
        OR: parentConditions
      }
    });

    // Filter out specific_parents notices if the parent's child is not in targetStudentIds
    const filteredNotices = rawNotices.filter((n) => {
      if (n.audience === 'specific_parents') {
        const targets = n.attachments?.targetStudentIds || [];
        return targets.some((tId) => studentIds.includes(tId));
      }
      return true;
    });

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const page = Math.max(1, Number(query.page) || 1);
    const enrichedNotices = await batchEnrichNoticeViewers(schoolId, filteredNotices);

    return {
      notices: enrichedNotices.map(formatNoticeResponse),
      pagination: {
        page,
        limit,
        total: filteredNotices.length,
        totalPages: Math.ceil(filteredNotices.length / limit)
      }
    };
  }

  // 4. Student Visibility
  if (systemRole === SYSTEM_ROLES.STUDENT || actor.roles?.includes(SYSTEM_ROLES.STUDENT)) {
    const student = await noticeRepository.findStudentByUserId(schoolId, userId);
    const studentClassId = student?.classId || null;

    const studentConditions = [
      {
        type: 'global',
        audience: { in: ['all', 'students', 'students_parents'] }
      }
    ];

    if (studentClassId) {
      studentConditions.push({
        type: 'class',
        classId: studentClassId,
        audience: { in: ['all', 'students', 'students_parents'] }
      });
    }

    const { notices, total } = await noticeRepository.findNoticesList(schoolId, {
      ...query,
      customWhere: {
        OR: studentConditions
      }
    });

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const page = Math.max(1, Number(query.page) || 1);
    const enrichedNotices = await batchEnrichNoticeViewers(schoolId, notices);

    return {
      notices: enrichedNotices.map(formatNoticeResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Default fallback for staff or other authenticated roles
  const { notices, total } = await noticeRepository.findNoticesList(schoolId, {
    ...query,
    customWhere: {
      type: 'global',
      audience: { in: ['all', 'teachers'] }
    }
  });

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const page = Math.max(1, Number(query.page) || 1);
  const enrichedNotices = await batchEnrichNoticeViewers(schoolId, notices);

  return {
    notices: enrichedNotices.map(formatNoticeResponse),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Verifies whether the authenticated user is authorized to view a specific notice.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} notice - Database Notice record
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<boolean>} True if visible, false otherwise
 */
export async function verifyNoticeVisibility(schoolId, notice, actor = {}) {
  const systemRole = (actor.systemRole || actor.role || '').toUpperCase();
  const userId = actor.userId || actor.id;

  const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
  const isSchoolAdmin = systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN);
  const isPrincipal = systemRole === SYSTEM_ROLES.PRINCIPAL || actor.roles?.includes(SYSTEM_ROLES.PRINCIPAL);

  // 1. Institutional Admins have unrestricted tenant visibility
  if (isSuperAdmin || isSchoolAdmin || isPrincipal) {
    return true;
  }

  const rawAttachments = notice.attachments || {};
  const authorId = rawAttachments.authorId;
  if (authorId && authorId === userId) {
    return true;
  }

  // 2. Teacher Visibility
  if (systemRole === SYSTEM_ROLES.TEACHER || actor.roles?.includes(SYSTEM_ROLES.TEACHER)) {
    if (notice.type === 'global') {
      return ['all', 'teachers'].includes(notice.audience);
    }
    if (notice.type === 'class') {
      const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
      const assignedClassId = staffProfile?.assignedClassId || null;
      const headedClassIds = staffProfile?.headedClasses?.map((c) => c.id) || [];
      const teacherClassIds = [assignedClassId, ...headedClassIds].filter(Boolean);
      return teacherClassIds.includes(notice.classId);
    }
    return false;
  }

  // 3. Parent Visibility
  if (systemRole === SYSTEM_ROLES.PARENT || actor.roles?.includes(SYSTEM_ROLES.PARENT)) {
    const { studentIds, classIds } = await noticeRepository.findParentStudentsAndClasses(schoolId, userId);
    if (notice.type === 'global') {
      if (!['all', 'parents', 'students_parents', 'specific_parents'].includes(notice.audience)) {
        return false;
      }
      if (notice.audience === 'specific_parents') {
        const targetStudentIds = rawAttachments.targetStudentIds || [];
        return targetStudentIds.some((tId) => studentIds.includes(tId));
      }
      return true;
    }
    if (notice.type === 'class') {
      if (!classIds.includes(notice.classId)) {
        return false;
      }
      if (notice.audience === 'specific_parents') {
        const targetStudentIds = rawAttachments.targetStudentIds || [];
        return targetStudentIds.some((tId) => studentIds.includes(tId));
      }
      return true;
    }
    return false;
  }

  // 4. Student Visibility
  if (systemRole === SYSTEM_ROLES.STUDENT || actor.roles?.includes(SYSTEM_ROLES.STUDENT)) {
    const student = await noticeRepository.findStudentByUserId(schoolId, userId);
    const studentClassId = student?.classId || null;
    if (notice.type === 'global') {
      return ['all', 'students', 'students_parents'].includes(notice.audience);
    }
    if (notice.type === 'class') {
      return notice.classId === studentClassId && ['all', 'students', 'students_parents'].includes(notice.audience);
    }
    return false;
  }

  // Fallback for staff
  if (notice.type === 'global') {
    return ['all', 'teachers'].includes(notice.audience);
  }

  return false;
}

/**
 * Retrieves a single notice by ID and verifies visibility for the caller.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<Object>} Formatted notice object
 */
export async function getNoticeById(schoolId, noticeId, actor = {}) {
  const notice = await noticeRepository.findNoticeById(schoolId, noticeId);

  if (!notice) {
    throw new NotFoundError('Notice');
  }

  const isVisible = await verifyNoticeVisibility(schoolId, notice, actor);
  if (!isVisible) {
    throw new NotFoundError('Notice');
  }

  const [enriched] = await batchEnrichNoticeViewers(schoolId, [notice]);
  return formatNoticeResponse(enriched || notice);
}

/**
 * Creates a new notice document with full tenant validation and audit trail.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} payload - Validated notice data
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<Object>} Created notice object
 */
export async function createNotice(schoolId, payload, actor = {}) {
  const systemRole = (actor.systemRole || actor.role || '').toUpperCase();
  const userId = actor.userId || actor.id;

  const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
  const isSchoolAdmin = systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN);
  const isPrincipal = systemRole === SYSTEM_ROLES.PRINCIPAL || actor.roles?.includes(SYSTEM_ROLES.PRINCIPAL);
  const isInstitutionalAdmin = isSuperAdmin || isSchoolAdmin || isPrincipal;

  const content = payload.content || payload.message;
  if (!content) {
    throw new ValidationError('Notice content/message is required');
  }

  const type = payload.type || 'global';
  let classId = payload.classId || null;

  // Validate class notices
  if (type === 'class') {
    if (!classId) {
      throw new ValidationError('Class ID is required for class notices');
    }

    const classRecord = await noticeRepository.findClassInTenant(schoolId, classId);
    if (!classRecord) {
      throw new NotFoundError('Class');
    }

    // If author is a teacher without institutional admin rights, verify teacher authority for this class
    if (!isInstitutionalAdmin) {
      const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
      const isAssigned = staffProfile?.assignedClassId === classId || classRecord.classTeacherId === staffProfile?.id;
      const isHeaded = staffProfile?.headedClasses?.some((c) => c.id === classId);

      if (!isAssigned && !isHeaded) {
        throw new ForbiddenError('You are not authorized to post notices for this class');
      }
    }
  } else {
    // Global notices posted by non-admin must have noticeboard:create permission
    if (!isInstitutionalAdmin) {
      const hasCreatePerm = Boolean(actor.permissions?.noticeboard?.canCreate);
      if (!hasCreatePerm) {
        throw new ForbiddenError('Only administrators can post global announcements');
      }
    }
    classId = null;
  }

  // Validate specific parents targeting
  if (payload.audience === 'specific_parents') {
    const targetStudentIds = payload.targetStudentIds || [];
    if (targetStudentIds.length === 0) {
      throw new ValidationError('Target student IDs are required when audience is "specific_parents"');
    }

    const verifiedStudents = await noticeRepository.findStudentsInTenant(schoolId, targetStudentIds);
    if (verifiedStudents.length !== targetStudentIds.length) {
      throw new ValidationError('One or more target student IDs are invalid or belong to a different tenant');
    }
  }

  // Resolve author identity
  const { authorId, authorName } = await resolveActorIdentity(schoolId, actor);

  // Build attachments metadata
  const attachmentsData = {
    priority: payload.priority || 'normal',
    authorId,
    authorName,
    targetStudentIds: payload.targetStudentIds || [],
    files: Array.isArray(payload.attachments)
      ? payload.attachments
      : payload.attachments?.files || []
  };

  const createdNotice = await noticeRepository.createNotice(schoolId, {
    title: payload.title,
    content,
    type,
    classId,
    audience: payload.audience || 'all',
    viewedBy: [],
    attachments: attachmentsData
  });

  // Non-blocking audit log
  await createAuditLog({
    schoolId,
    entityType: 'Notice',
    entityId: createdNotice.id,
    actionPerformed: 'NOTICE_CREATED',
    userName: authorName,
    userRole: systemRole,
    modifiedFields: {
      title: payload.title,
      type,
      audience: payload.audience,
      priority: payload.priority
    }
  });

  return formatNoticeResponse(createdNotice);
}

/**
 * Updates an existing notice with tenant scoping and ownership/admin permission check.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} payload - Fields to update
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<Object>} Updated notice object
 */
export async function updateNotice(schoolId, noticeId, payload, actor = {}) {
  const existingNotice = await noticeRepository.findNoticeById(schoolId, noticeId);

  if (!existingNotice) {
    throw new NotFoundError('Notice');
  }

  const systemRole = (actor.systemRole || actor.role || '').toUpperCase();
  const userId = actor.userId || actor.id;

  const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
  const isSchoolAdmin = systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN);
  const isPrincipal = systemRole === SYSTEM_ROLES.PRINCIPAL || actor.roles?.includes(SYSTEM_ROLES.PRINCIPAL);
  const isInstitutionalAdmin = isSuperAdmin || isSchoolAdmin || isPrincipal;

  const currentAttachments = existingNotice.attachments || {};
  const currentAuthorId = currentAttachments.authorId;

  // Only institutional admins or original author can update
  if (!isInstitutionalAdmin && currentAuthorId && currentAuthorId !== userId) {
    throw new ForbiddenError('You are not authorized to edit this notice');
  }

  const content = payload.content || payload.message || existingNotice.content;

  // Validate class and type changes for non-admins
  let classId = existingNotice.classId;
  let type = payload.type || existingNotice.type;

  if (!isInstitutionalAdmin) {
    if (payload.type === 'global' && existingNotice.type !== 'global') {
      const hasCreatePerm = Boolean(actor.permissions?.noticeboard?.canCreate);
      if (!hasCreatePerm) {
        throw new ForbiddenError('You are not authorized to convert a class notice to a global notice');
      }
    }

    if (payload.classId && payload.classId !== existingNotice.classId) {
      const staffProfile = await noticeRepository.findStaffProfileByUserId(schoolId, userId);
      const isAssigned = staffProfile?.assignedClassId === payload.classId;
      const isHeaded = staffProfile?.headedClasses?.some((c) => c.id === payload.classId);
      if (!isAssigned && !isHeaded) {
        throw new ForbiddenError('You are not authorized to reassign notices to this class');
      }
    }
  }

  if (payload.classId !== undefined) {
    if (payload.classId) {
      const classRecord = await noticeRepository.findClassInTenant(schoolId, payload.classId);
      if (!classRecord) {
        throw new NotFoundError('Class');
      }
      classId = payload.classId;
    } else {
      classId = null;
    }
  }

  if (payload.audience === 'specific_parents' && payload.targetStudentIds) {
    const verifiedStudents = await noticeRepository.findStudentsInTenant(schoolId, payload.targetStudentIds);
    if (verifiedStudents.length !== payload.targetStudentIds.length) {
      throw new ValidationError('One or more target student IDs are invalid or belong to a different tenant');
    }
  }

  // Update attachments metadata preserving author details
  const updatedAttachments = {
    priority: payload.priority || currentAttachments.priority || 'normal',
    authorId: currentAttachments.authorId || userId,
    authorName: currentAttachments.authorName || 'Administrator',
    targetStudentIds: payload.targetStudentIds || currentAttachments.targetStudentIds || [],
    files: Array.isArray(payload.attachments)
      ? payload.attachments
      : payload.attachments?.files || currentAttachments.files || []
  };

  const updatedNotice = await noticeRepository.updateNotice(schoolId, noticeId, {
    title: payload.title || existingNotice.title,
    content,
    type,
    classId,
    audience: payload.audience || existingNotice.audience,
    attachments: updatedAttachments
  });

  // Non-blocking audit log
  await createAuditLog({
    schoolId,
    entityType: 'Notice',
    entityId: noticeId,
    actionPerformed: 'NOTICE_UPDATED',
    userName: actor.name || actor.email || 'Administrator',
    userRole: systemRole,
    modifiedFields: payload
  });

  return formatNoticeResponse(updatedNotice);
}

/**
 * Deletes a notice document within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<{ id: string, message: string }>}
 */
export async function deleteNotice(schoolId, noticeId, actor = {}) {
  const existingNotice = await noticeRepository.findNoticeById(schoolId, noticeId);

  if (!existingNotice) {
    throw new NotFoundError('Notice');
  }

  const systemRole = (actor.systemRole || actor.role || '').toUpperCase();
  const userId = actor.userId || actor.id;

  const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
  const isSchoolAdmin = systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || actor.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN);
  const isPrincipal = systemRole === SYSTEM_ROLES.PRINCIPAL || actor.roles?.includes(SYSTEM_ROLES.PRINCIPAL);
  const isInstitutionalAdmin = isSuperAdmin || isSchoolAdmin || isPrincipal;

  const currentAttachments = existingNotice.attachments || {};
  const currentAuthorId = currentAttachments.authorId;

  // Only institutional admins or original author can delete
  if (!isInstitutionalAdmin && currentAuthorId && currentAuthorId !== userId) {
    throw new ForbiddenError('You are not authorized to delete this notice');
  }

  await noticeRepository.deleteNotice(schoolId, noticeId);

  // Non-blocking audit log
  await createAuditLog({
    schoolId,
    entityType: 'Notice',
    entityId: noticeId,
    actionPerformed: 'NOTICE_DELETED',
    userName: actor.name || actor.email || 'Administrator',
    userRole: systemRole,
    modifiedFields: {
      title: existingNotice.title
    }
  });

  return {
    id: noticeId,
    message: 'Notice deleted successfully'
  };
}

/**
 * Records a viewer read receipt idempotently for the notice.
 * Supports multi-student parent accounts by recording receipts for each eligible linked student.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} actor - Authenticated actor
 * @returns {Promise<{ notice: Object, alreadyViewed: boolean }>}
 */
export async function recordNoticeView(schoolId, noticeId, actor = {}) {
  const userId = actor.userId || actor.id;
  const role = (actor.systemRole || actor.role || '').toUpperCase();

  const notice = await noticeRepository.findNoticeById(schoolId, noticeId);
  if (!notice) {
    throw new NotFoundError('Notice');
  }

  // Verify actor visibility / authorization for this notice
  const isVisible = await verifyNoticeVisibility(schoolId, notice, actor);
  if (!isVisible) {
    throw new NotFoundError('Notice');
  }

  const rawAttachments = notice.attachments || {};
  const targetStudentIds = Array.isArray(rawAttachments.targetStudentIds)
    ? rawAttachments.targetStudentIds
    : [];

  let viewersToRecord = [];

  // 1. Check if Parent
  const isParent = role === SYSTEM_ROLES.PARENT || role === 'PARENT' || actor.parentProfile;
  if (isParent) {
    const parentProfile = await noticeRepository.findParentWithLinkedStudents(schoolId, userId);
    if (parentProfile) {
      const allLinkedStudents = (parentProfile.children || [])
        .map((c) => c.student)
        .filter(Boolean);

      // Determine which linked students are eligible recipients under existing notice targeting rules
      let eligibleStudents = [];

      if (notice.type === 'global') {
        if (notice.audience === 'specific_parents') {
          eligibleStudents = allLinkedStudents.filter((st) => targetStudentIds.includes(st.id));
        } else {
          // 'all', 'parents', 'students_parents' -> all linked students eligible
          eligibleStudents = allLinkedStudents;
        }
      } else if (notice.type === 'class') {
        if (notice.audience === 'specific_parents') {
          eligibleStudents = allLinkedStudents.filter((st) => st.classId === notice.classId && targetStudentIds.includes(st.id));
        } else {
          eligibleStudents = allLinkedStudents.filter((st) => st.classId === notice.classId);
        }
      }

      const now = new Date().toISOString();

      if (eligibleStudents.length > 0) {
        viewersToRecord = eligibleStudents.map((st) => {
          const studentFullName = `${st.firstName || ''} ${st.lastName || ''}`.trim();
          const parentName = (parentProfile.name || '').trim();
          let displayName = studentFullName;
          if (parentName && parentName.toLowerCase() !== studentFullName.toLowerCase()) {
            displayName = `${parentName} (${studentFullName})`;
          }

          return {
            uid: userId,
            parentUserId: userId,
            parentName: parentName || 'Parent',
            studentId: st.id,
            studentName: studentFullName,
            name: displayName,
            role: 'parent',
            classId: st.classId || '',
            viewedAt: now
          };
        });
      } else {
        // Fallback if parent has no linked students or none in target
        viewersToRecord = [
          {
            uid: userId,
            name: parentProfile.name || 'Parent',
            role: 'parent',
            classId: '',
            viewedAt: now
          }
        ];
      }
    }
  }

  // 2. If not parent or parentProfile was not found
  if (viewersToRecord.length === 0) {
    const { name, role: resolvedRole, classId } = await resolveViewerIdentity(schoolId, userId, actor);
    viewersToRecord = [
      {
        uid: userId,
        name,
        role: resolvedRole.toLowerCase(),
        classId,
        viewedAt: new Date().toISOString()
      }
    ];
  }

  const result = await noticeRepository.recordNoticeView(schoolId, noticeId, viewersToRecord);

  if (!result) {
    throw new NotFoundError('Notice');
  }

  const [enriched] = await batchEnrichNoticeViewers(schoolId, [result.notice]);

  return {
    notice: formatNoticeResponse(enriched || result.notice),
    alreadyViewed: result.alreadyViewed
  };
}
