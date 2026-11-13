import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.client.js';
import * as academicResourceRepo from './academic-resource.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { hasAdminPanelScope } from '../../utils/access-scope.js';
import { getTeacherAssignments } from '../classes/class.service.js';
import { notifyResourceRecipients, RESOURCE_NOTIFICATION_TYPE, resourceMessagePrefix } from './academic-resource.notify.js';

const ADMIN_ROLE_SET = new Set([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'CORRESPONDENT',
  'ADMINISTRATIVE_OFFICER',
  'ADMINISTRATIVE-OFFICER',
  'VICE_PRINCIPAL',
  'VICE-PRINCIPAL',
  'SUBJECT_WISE_HEAD',
  'SUBJECT-WISE-HEAD',
  'CLASS_INCHARGE',
  'CLASS-INCHARGE',
  'ADMIN'
]);

/**
 * Checks if the authenticated user has administrative management privileges over academic resources.
 *
 * @param {Object} actor - Authenticated user context
 * @returns {boolean}
 */
export function isAcademicResourceAdmin(actor) {
  if (!actor) return false;
  if (hasAdminPanelScope(actor)) return true;

  const systemRole = (actor.systemRole || actor.role || '').toUpperCase().replace(/\s+/g, '_');
  if (ADMIN_ROLE_SET.has(systemRole)) {
    return true;
  }

  const roles = Array.isArray(actor.roles) ? actor.roles : [];
  return roles.some(r => {
    const normalized = String(r).toUpperCase().replace(/\s+/g, '_');
    return ADMIN_ROLE_SET.has(normalized);
  });
}

/**
 * Resource access scope for a user (who may see / post which section + subject).
 *
 * Rules (resources are targeted at a Class + Section + Subject):
 *  - Admin-panel roles                       -> null (everything)
 *  - Class teacher of the section            -> every resource of that section (any subject)
 *  - Subject = a real subject                -> only teachers who teach THAT subject in that section
 *                                               (timetable periods, or Staff Directory subject + class assignment)
 *  - Subject = General (none)                -> every teacher who handles that section
 *  - The uploader always sees what they uploaded.
 *
 * @param {string} schoolId
 * @param {Object} actor
 * @returns {Promise<null|Object>}
 */
export async function getResourceAccess(schoolId, actor) {
  if (isAcademicResourceAdmin(actor)) return null;

  const userId = actor?.id || actor?.userId;
  const access = {
    userId,
    classTeacherSectionIds: new Set(), // sections this user is class teacher of
    classTeacherClassIds: new Set(), // section-less classes this user heads
    teachingSectionIds: new Set(), // every section the user handles in any way
    wholeClassIds: new Set(), // classes handled as a whole (no section split)
    classIds: new Set(), // every class the user touches
    sectionSubjects: new Map(), // sectionId -> Set(subjectId) taught there
    classSubjects: new Map(), // classId -> Set(subjectId) taught class-wide
    sectionClass: new Map() // sectionId -> classId
  };
  if (!userId) return access;

  const assignments = await getTeacherAssignments(schoolId, userId);
  const { staffProfile } = assignments;
  if (!staffProfile) return access;

  for (const id of assignments.classTeacherSectionIds) access.classTeacherSectionIds.add(id);
  for (const id of assignments.sectionIds) access.teachingSectionIds.add(id);
  for (const id of assignments.wholeClassIds) {
    access.wholeClassIds.add(id);
    access.classIds.add(id);
  }

  const headed = Array.isArray(staffProfile.headedClasses) ? staffProfile.headedClasses.map(c => c.id) : [];
  for (const id of headed) if (access.wholeClassIds.has(id)) access.classTeacherClassIds.add(id);

  const addPair = (map, key, subjectId) => {
    if (!key || !subjectId) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(subjectId);
  };

  // Subject teacher from timetable (authoritative "teaches X in section Y")
  const periods = await prisma.timetablePeriod.findMany({
    where: { schoolId, teacherId: staffProfile.id, subjectId: { not: null } },
    select: { classId: true, sectionId: true, subjectId: true }
  });
  for (const p of periods) {
    if (p.sectionId) addPair(access.sectionSubjects, p.sectionId, p.subjectId);
    else addPair(access.classSubjects, p.classId, p.subjectId);
  }

  // Subject teacher from Staff Directory (assigned subjects x explicitly assigned class/section units)
  const custom = staffProfile.customData || {};
  const directorySubjectIds = [
    ...(Array.isArray(custom.assignments?.assignedSubjectIds) ? custom.assignments.assignedSubjectIds : []),
    ...(Array.isArray(custom.assignedSubjectIds) ? custom.assignedSubjectIds : [])
  ].filter(id => typeof id === 'string' && id);
  const directoryUnitIds = (Array.isArray(custom.assignments?.subjectClassIds) ? custom.assignments.subjectClassIds : [])
    .filter(id => typeof id === 'string' && id);

  if (directorySubjectIds.length > 0 && directoryUnitIds.length > 0) {
    const [unitSections, unitClasses] = await Promise.all([
      prisma.section.findMany({ where: { schoolId, id: { in: directoryUnitIds } }, select: { id: true } }),
      prisma.class.findMany({ where: { schoolId, id: { in: directoryUnitIds } }, select: { id: true } })
    ]);
    for (const sec of unitSections) {
      for (const subjectId of directorySubjectIds) addPair(access.sectionSubjects, sec.id, subjectId);
    }
    for (const cls of unitClasses) {
      for (const subjectId of directorySubjectIds) addPair(access.classSubjects, cls.id, subjectId);
    }
  }

  // Resolve parent class of every section in scope
  const allSectionIds = new Set([
    ...access.teachingSectionIds,
    ...access.classTeacherSectionIds,
    ...access.sectionSubjects.keys()
  ]);
  for (const id of access.classTeacherSectionIds) access.teachingSectionIds.add(id);
  for (const id of access.sectionSubjects.keys()) access.teachingSectionIds.add(id);
  if (allSectionIds.size > 0) {
    const sections = await prisma.section.findMany({
      where: { schoolId, id: { in: Array.from(allSectionIds) } },
      select: { id: true, classId: true }
    });
    for (const sec of sections) {
      access.sectionClass.set(sec.id, sec.classId);
      access.classIds.add(sec.classId);
    }
  }
  for (const classId of access.classSubjects.keys()) access.classIds.add(classId);

  return access;
}

/**
 * Does the access scope cover this (class, section, subject) target? (uploader check NOT included)
 */
export function accessCoversTarget(access, { classId, sectionId, subjectId }) {
  if (!access) return true;

  if (sectionId) {
    if (access.classTeacherSectionIds.has(sectionId)) return true;
  } else if (access.classTeacherClassIds.has(classId)) {
    return true;
  }

  if (!subjectId) {
    // General: anyone who handles that section / class
    if (sectionId) return access.teachingSectionIds.has(sectionId) || access.wholeClassIds.has(classId);
    return access.classIds.has(classId);
  }

  if (sectionId && access.sectionSubjects.get(sectionId)?.has(subjectId)) return true;
  if (access.classSubjects.get(classId)?.has(subjectId)) return true;
  return false;
}

/** Can the user see this stored resource? */
export function canAccessResource(access, resource) {
  if (!access) return true;
  if (resource.uploaderId === access.userId) return true;
  return accessCoversTarget(access, resource);
}

/** Prisma OR clauses equivalent of canAccessResource (for paginated list queries). */
export function buildVisibilityOr(access) {
  const or = [{ uploaderId: access.userId }];

  const ctSections = Array.from(access.classTeacherSectionIds);
  if (ctSections.length) or.push({ sectionId: { in: ctSections } });

  const ctClasses = Array.from(access.classTeacherClassIds);
  if (ctClasses.length) or.push({ sectionId: null, classId: { in: ctClasses } });

  // General
  const sections = Array.from(access.teachingSectionIds);
  if (sections.length) or.push({ subjectId: null, sectionId: { in: sections } });
  const wholeClasses = Array.from(access.wholeClassIds);
  if (wholeClasses.length) or.push({ subjectId: null, classId: { in: wholeClasses } });
  const classes = Array.from(access.classIds);
  if (classes.length) or.push({ subjectId: null, sectionId: null, classId: { in: classes } });

  // Subject specific
  for (const [sectionId, subjects] of access.sectionSubjects) {
    or.push({ sectionId, subjectId: { in: Array.from(subjects) } });
  }
  for (const [classId, subjects] of access.classSubjects) {
    or.push({ classId, subjectId: { in: Array.from(subjects) } });
  }
  return or;
}

/**
 * Class ids this user may see/post resources for (kept for backward compatibility).
 * Admins -> null (all classes).
 */
export async function getAllowedClassIds(schoolId, actor) {
  const access = await getResourceAccess(schoolId, actor);
  return access ? new Set(access.classIds) : null;
}

/**
 * Class / section / subject combinations this user may post to (drives the Add Resource form).
 * Admins -> null (everything). Others -> [{ classId, sectionId|null, allSubjects, subjectIds }]
 */
export async function getAllowedTargets(schoolId, actor) {
  const access = await getResourceAccess(schoolId, actor);
  if (!access) return null;

  const targets = [];
  const sectionIds = new Set([...access.teachingSectionIds]);
  for (const sectionId of sectionIds) {
    const classId = access.sectionClass.get(sectionId);
    if (!classId) continue;
    const isClassTeacher = access.classTeacherSectionIds.has(sectionId);
    const subjectIds = new Set([
      ...(access.sectionSubjects.get(sectionId) || []),
      ...(access.classSubjects.get(classId) || [])
    ]);
    targets.push({ classId, sectionId, allSubjects: isClassTeacher, subjectIds: Array.from(subjectIds) });
  }
  for (const classId of access.wholeClassIds) {
    const alreadyViaSection = targets.some(t => t.classId === classId);
    if (alreadyViaSection) continue;
    targets.push({
      classId,
      sectionId: null,
      allSubjects: access.classTeacherClassIds.has(classId),
      subjectIds: Array.from(access.classSubjects.get(classId) || [])
    });
  }
  return targets;
}

/**
 * Builds a lookup map of user IDs to display names (StaffProfile.fullName -> User.email -> 'Unknown').
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} userIds - User UUIDs
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveUploaderNames(schoolId, userIds, tx = prisma) {
  const nameMap = new Map();
  if (!userIds || userIds.length === 0) return nameMap;

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return nameMap;

  const [staffProfiles, users] = await Promise.all([
    academicResourceRepo.findStaffProfilesByUserIds(schoolId, uniqueIds, tx),
    academicResourceRepo.findUsersByIds(schoolId, uniqueIds, tx)
  ]);

  for (const user of users) {
    nameMap.set(user.id, user.email || 'Unknown');
  }

  for (const profile of staffProfiles) {
    const profileName = profile.name || profile.fullName;
    if (profileName) {
      nameMap.set(profile.userId, profileName);
    } else if (profile.user?.email && !nameMap.has(profile.userId)) {
      nameMap.set(profile.userId, profile.user.email);
    }
  }

  return nameMap;
}

/**
 * Formats an AcademicResource database entity into the authoritative REST DTO.
 *
 * @param {Object} resource - Raw database record
 * @param {Map<string, string>|string} [uploaderNameOrMap] - Map or resolved name
 * @returns {Object} Canonical REST DTO
 */
export function formatAcademicResourceDto(resource, uploaderNameOrMap) {
  if (!resource) return null;

  let uploaderName = 'Unknown';
  if (typeof uploaderNameOrMap === 'string') {
    uploaderName = uploaderNameOrMap;
  } else if (uploaderNameOrMap instanceof Map) {
    uploaderName = uploaderNameOrMap.get(resource.uploaderId) || 'Unknown';
  }

  return {
    id: resource.id,
    title: resource.title,
    classId: resource.classId,
    className: resource.class?.name || null,
    sectionId: resource.sectionId || null,
    sectionName: resource.section?.name || null,
    subjectId: resource.subjectId || null,
    subjectName: resource.subject?.name || null,
    uploaderId: resource.uploaderId,
    uploaderName,
    fileUrl: resource.fileUrl || null,
    type: resource.fileType || 'document',
    description: resource.description || null,
    audience: resource.audience || 'teachers',
    batchId: resource.batchId || null,
    allClasses: resource.allClasses === true,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt
  };
}

/**
 * Lists Academic Resources for a tenant with filtering and pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
 */
export async function listAcademicResources(schoolId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list academic resources');
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const access = actor ? await getResourceAccess(schoolId, actor) : null;

  const filters = {
    visibilityOr: access ? buildVisibilityOr(access) : undefined,
    classId: query.classId,
    sectionId: query.sectionId,
    subjectId: query.subjectId,
    type: query.type,
    uploaderId: query.uploaderId,
    search: query.search
  };

  const [records, total] = await Promise.all([
    academicResourceRepo.listAcademicResources(schoolId, filters, { page, limit }),
    academicResourceRepo.countAcademicResources(schoolId, filters)
  ]);

  const uploaderIds = records.map(r => r.uploaderId);
  const uploaderNameMap = await resolveUploaderNames(schoolId, uploaderIds);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: records.map(r => formatAcademicResourceDto(r, uploaderNameMap)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Resources shared with a student (and their parents): audience = teachers_students,
 * same class + section as the student. Parents can only query their linked children;
 * students only themselves.
 *
 * @param {string} schoolId
 * @param {Object} actor - parent or student user
 * @param {string} studentId
 * @param {Object} query - { type, subjectId, search, page, limit }
 */
export async function listAcademicResourcesForStudent(schoolId, actor, studentId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list academic resources');
  }

  const role = String(actor?.systemRole || actor?.role || '').toUpperCase();
  const userId = actor?.id || actor?.userId;
  if (role === 'PARENT') {
    const authorized = await academicResourceRepo.findAuthorizedStudentIdsForParent(schoolId, userId);
    if (!authorized.includes(studentId)) throw new NotFoundError('Student');
  } else if (role === 'STUDENT') {
    const ownId = actor?.studentId || actor?.id;
    if (ownId !== studentId) throw new ForbiddenError('Students can only view their own resources');
  } else {
    throw new ForbiddenError('Only parents and students can use this view');
  }

  const student = await academicResourceRepo.findStudentPlacement(schoolId, studentId);
  if (!student) throw new NotFoundError('Student');

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  // A student without a class has nothing to receive
  if (!student.classId) {
    return { data: [], pagination: { page, limit, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
  }

  const filters = {
    studentTarget: { classId: student.classId, sectionId: student.sectionId || null },
    subjectId: query.subjectId,
    type: query.type,
    search: query.search
  };

  const [records, total] = await Promise.all([
    academicResourceRepo.listAcademicResources(schoolId, filters, { page, limit }),
    academicResourceRepo.countAcademicResources(schoolId, filters)
  ]);

  const nameMap = await resolveUploaderNames(schoolId, records.map(r => r.uploaderId));
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data: records.map(r => formatAcademicResourceDto(r, nameMap)),
    pagination: { page, limit, total, totalPages, hasNextPage: page * limit < total, hasPrevPage: page > 1 }
  };
}

/**
 * Unread badge count for the sidebar "Resources" item (parent / teacher / staff).
 *
 * Counts the resources that are CURRENTLY visible to the user (a deleted send never counts) and
 * were shared after the user last opened the Resources module. "Last opened" is derived from the
 * user's unread resource alerts: an unread alert means the module was not opened since it was sent,
 * so every visible resource sent from the oldest unread alert onward is unseen.
 * One send to many classes counts once.
 *
 * @param {string} schoolId
 * @param {Object} actor
 * @returns {Promise<number>}
 */
export async function countUnreadResources(schoolId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to count unread resources');
  }
  const userId = actor?.id || actor?.userId;
  if (!userId || isAcademicResourceAdmin(actor)) return 0;

  const oldestUnread = await prisma.notification.findFirst({
    where: { schoolId, userId, type: RESOURCE_NOTIFICATION_TYPE, read: false },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  });
  if (!oldestUnread) return 0;

  // the alert is written right after the resource rows, so allow a small margin
  const since = new Date(new Date(oldestUnread.createdAt).getTime() - 15 * 1000);
  const role = String(actor?.systemRole || actor?.role || '').toUpperCase();

  let where;
  if (role === 'PARENT') {
    const studentIds = await academicResourceRepo.findAuthorizedStudentIdsForParent(schoolId, userId);
    const placements = await Promise.all(studentIds.map(id => academicResourceRepo.findStudentPlacement(schoolId, id)));
    const targetOr = placements
      .filter(p => p?.classId)
      .map(p => ({
        classId: p.classId,
        OR: p.sectionId ? [{ sectionId: p.sectionId }, { sectionId: null }] : [{ sectionId: null }]
      }));
    if (targetOr.length === 0) return 0;
    where = { schoolId, audience: 'teachers_students', createdAt: { gte: since }, OR: targetOr };
  } else {
    const access = await getResourceAccess(schoolId, actor);
    if (!access) return 0;
    where = {
      schoolId,
      createdAt: { gte: since },
      uploaderId: { not: userId },
      OR: buildVisibilityOr(access)
    };
  }

  const rows = await prisma.academicResource.findMany({ where, select: { id: true, batchId: true } });
  return new Set(rows.map(r => r.batchId || r.id)).size;
}

/**
 * Retrieves a single Academic Resource by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @returns {Promise<Object>} AcademicResource DTO
 */
export async function getAcademicResourceById(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const record = await academicResourceRepo.findAcademicResourceById(schoolId, id);
  if (!record) {
    throw new NotFoundError('Academic resource not found');
  }

  if (actor) {
    const access = await getResourceAccess(schoolId, actor);
    if (!canAccessResource(access, record)) {
      throw new NotFoundError('Academic resource not found');
    }
  }

  const nameMap = await resolveUploaderNames(schoolId, [record.uploaderId]);
  return formatAcademicResourceDto(record, nameMap);
}

/**
 * Expands the requested targets (single / many / "All Class") into validated
 * [{ classId, sectionId, label }] entries for this school.
 */
async function resolveCreateTargets(schoolId, payload, access) {
  const classes = await prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true, sections: { select: { id: true, name: true } } }
  });
  const classMap = new Map(classes.map(c => [c.id, c]));
  const labelOf = (c, sec) => (sec ? `${c.name} - ${sec.name}` : c.name);

  // "All Class": every class/section (admin) or every one the teacher is allowed to post to
  if (payload.allClasses === true) {
    const subjectId = payload.subjectId || null;
    const all = [];
    for (const c of classes) {
      if (c.sections.length > 0) {
        for (const sec of c.sections) all.push({ classId: c.id, sectionId: sec.id, label: labelOf(c, sec) });
      } else {
        all.push({ classId: c.id, sectionId: null, label: labelOf(c) });
      }
    }
    const allowed = all.filter(t => accessCoversTarget(access, { ...t, subjectId }));
    if (allowed.length === 0) {
      throw new ForbiddenError('You do not handle any class / section that this resource can be shared with');
    }
    return allowed;
  }

  const requested = Array.isArray(payload.targets) && payload.targets.length > 0
    ? payload.targets
    : [{ classId: payload.classId, sectionId: payload.sectionId || null }];

  const seen = new Set();
  const resolved = [];
  for (const t of requested) {
    const c = classMap.get(t.classId);
    if (!c) throw new NotFoundError('Class not found in this school');
    const sectionId = t.sectionId || null;
    let sec = null;
    if (sectionId) {
      sec = c.sections.find(s => s.id === sectionId);
      if (!sec) throw new ValidationError('Selected section does not belong to the selected class');
    } else if (c.sections.length > 0) {
      throw new ValidationError(`Please select a section for ${c.name}`);
    }
    const key = `${c.id}:${sectionId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ classId: c.id, sectionId, label: labelOf(c, sec) });
  }
  return resolved;
}

/**
 * Creates Academic Resource(s): one record per selected class/section so that the existing
 * class-teacher / subject-teacher / student / parent visibility rules keep working unchanged.
 * Recipients (class teacher, subject teachers, parents for teachers_students) are notified.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} payload - Validated create payload (classId | targets[] | allClasses)
 * @returns {Promise<Array<Object>>} Created AcademicResource DTOs
 */
export async function createAcademicResource(schoolId, actor, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create academic resource');
  }
  const uploaderId = actor?.id || actor?.userId;
  if (!uploaderId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }

  // 1. Subject belongs to tenant if provided (empty = General)
  const subjectId = payload.subjectId || null;
  if (subjectId) {
    const subjectRecord = await academicResourceRepo.findSubjectInTenant(schoolId, subjectId);
    if (!subjectRecord) {
      throw new NotFoundError('Subject not found in this school');
    }
  }

  // 2. Resolve + validate every class / section target
  const access = await getResourceAccess(schoolId, actor);
  const targets = await resolveCreateTargets(schoolId, payload, access);

  // 3. Non-admin staff: class teacher of EVERY selected section, or teacher of that subject there
  for (const t of targets) {
    if (!accessCoversTarget(access, { classId: t.classId, sectionId: t.sectionId, subjectId })) {
      throw new ForbiddenError(
        subjectId
          ? `You can only share a subject resource with sections where you are the class teacher or teach that subject (${t.label})`
          : `You can only share resources with sections you handle (${t.label})`
      );
    }
  }

  const audience = payload.audience || 'teachers';
  const batchId = crypto.randomUUID(); // every class/section of this send shares it -> ONE card in the UI
  const allClasses = payload.allClasses === true;
  const createdRecords = await prisma.$transaction(
    async tx => {
      const rows = [];
      for (const t of targets) {
        rows.push(
          await academicResourceRepo.createAcademicResource(
            schoolId,
            {
              title: payload.title,
              classId: t.classId,
              sectionId: t.sectionId,
              subjectId,
              uploaderId,
              fileUrl: payload.fileUrl || null,
              type: payload.type || 'document',
              audience,
              batchId,
              allClasses,
              description: payload.description || null
            },
            tx
          )
        );
      }
      return rows;
    },
    { timeout: 30000, maxWait: 10000 }
  );

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: createdRecords[0].id,
    actionPerformed: 'ACADEMIC_RESOURCE_CREATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'TEACHER',
    modifiedFields: {
      title: payload.title,
      targetCount: createdRecords.length,
      targets: targets.map(t => t.label),
      batchId,
      allClasses,
      subjectId,
      audience,
      fileType: createdRecords[0].fileType
    }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource creation audit log:', err.message);
  });

  // Non-blocking: tell class teacher / subject teachers (and parents when audience = teachers_students)
  const labelByKey = new Map(targets.map(t => [`${t.classId}:${t.sectionId || ''}`, t.label]));
  notifyResourceRecipients(
    schoolId,
    createdRecords.map(r => ({
      classId: r.classId,
      sectionId: r.sectionId || null,
      subjectId: r.subjectId || null,
      audience: r.audience,
      label: labelByKey.get(`${r.classId}:${r.sectionId || ''}`) || ''
    })),
    { uploaderId, title: payload.title, allClasses }
  ).catch(err => {
    console.error('[RESOURCE NOTIFY WARNING] Failed to notify resource recipients:', err.message);
  });

  const nameMap = await resolveUploaderNames(schoolId, [uploaderId]);
  return createdRecords.map(r => formatAcademicResourceDto(r, nameMap));
}

/**
 * Updates an existing Academic Resource within an isolated transaction with row locking and custody checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - AcademicResource UUID
 * @param {Object} payload - Validated update payload
 * @returns {Promise<Object>} Updated AcademicResource DTO
 */
export async function updateAcademicResource(schoolId, actor, id, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }
  const isAdmin = isAcademicResourceAdmin(actor);

  const updated = await prisma.$transaction(
    async tx => {
      // 1. Fetch resource with row lock for race safety
      const existing = await academicResourceRepo.findAcademicResourceWithLock(schoolId, id, tx);
      if (!existing) {
        throw new NotFoundError('Academic resource not found');
      }

      // 2. Custody check: Teachers and staff can only update their own resources
      if (!isAdmin && existing.uploaderId !== userId) {
        throw new ForbiddenError('You are only authorized to update your own resources');
      }

      // 3. Class / section validation if changing the target
      const finalClassId = payload.classId || existing.classId;
      if (payload.classId) {
        const classRecord = await academicResourceRepo.findClassInTenant(schoolId, payload.classId, tx);
        if (!classRecord) {
          throw new NotFoundError('Class not found in this school');
        }
      }
      if (payload.sectionId) {
        const sectionRecord = await academicResourceRepo.findSectionInTenant(schoolId, payload.sectionId, tx);
        if (!sectionRecord || sectionRecord.classId !== finalClassId) {
          throw new ValidationError('Selected section does not belong to the selected class');
        }
      } else if (payload.classId && payload.classId !== existing.classId && payload.sectionId === undefined) {
        throw new ValidationError('Please select a section when changing the class');
      }

      // 4. Subject validation if changing subject
      if (payload.subjectId) {
        const subjectRecord = await academicResourceRepo.findSubjectInTenant(schoolId, payload.subjectId, tx);
        if (!subjectRecord) {
          throw new NotFoundError('Subject not found in this school');
        }
      }

      // 5. Non-admins may only retarget to a class/section/subject they are allowed to post to
      if (!isAdmin && (payload.classId || payload.sectionId !== undefined || payload.subjectId !== undefined)) {
        const access = await getResourceAccess(schoolId, actor);
        const target = {
          classId: finalClassId,
          sectionId: payload.sectionId !== undefined ? payload.sectionId : existing.sectionId || null,
          subjectId: payload.subjectId !== undefined ? payload.subjectId : existing.subjectId || null
        };
        if (!accessCoversTarget(access, target)) {
          throw new ForbiddenError('You can only share resources with sections and subjects you handle');
        }
      }

      return academicResourceRepo.updateAcademicResource(schoolId, id, payload, tx);
    },
    { timeout: 15000, maxWait: 10000 }
  );

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: updated.id,
    actionPerformed: 'ACADEMIC_RESOURCE_UPDATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: payload
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource update audit log:', err.message);
  });

  const nameMap = await resolveUploaderNames(schoolId, [updated.uploaderId]);
  return formatAcademicResourceDto(updated, nameMap);
}

/**
 * Deletes an Academic Resource within an isolated transaction with row locking and custody checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - AcademicResource UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteAcademicResource(schoolId, actor, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }
  const isAdmin = isAcademicResourceAdmin(actor);

  const existing = await prisma.$transaction(
    async tx => {
      // 1. Fetch resource with row lock
      const record = await academicResourceRepo.findAcademicResourceWithLock(schoolId, id, tx);
      if (!record) {
        throw new NotFoundError('Academic resource not found');
      }

      // 2. Custody check: Teachers and staff can only delete their own resources
      if (!isAdmin && record.uploaderId !== userId) {
        throw new ForbiddenError('You are only authorized to delete your own resources');
      }

      // A send to many classes is ONE card: deleting it removes it for every class teacher,
      // subject teacher, student and parent it was sent to.
      if (record.batchId) {
        const removed = await academicResourceRepo.deleteAcademicResourcesByBatch(
          schoolId,
          record.batchId,
          isAdmin ? null : userId,
          tx
        );
        return { ...record, deletedCount: removed.count };
      }
      await academicResourceRepo.deleteAcademicResource(schoolId, id, tx);
      return { ...record, deletedCount: 1 };
    },
    { timeout: 15000, maxWait: 10000 }
  );

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: id,
    actionPerformed: 'ACADEMIC_RESOURCE_DELETED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: { id, title: existing.title, batchId: existing.batchId || null, deletedCount: existing.deletedCount }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource deletion audit log:', err.message);
  });

  // Remove the matching "new resource" alerts so the Resources unread badge never counts a deleted send
  const sentAt = new Date(existing.createdAt).getTime();
  prisma.notification
    .deleteMany({
      where: {
        schoolId,
        type: RESOURCE_NOTIFICATION_TYPE,
        message: { startsWith: resourceMessagePrefix(existing.title) },
        createdAt: { gte: new Date(sentAt - 60 * 1000), lte: new Date(sentAt + 10 * 60 * 1000) }
      }
    })
    .catch(err => {
      console.error('[RESOURCE NOTIFY WARNING] Failed to clean up resource notifications:', err.message);
    });

  return {
    success: true,
    message: 'Academic resource deleted successfully'
  };
}