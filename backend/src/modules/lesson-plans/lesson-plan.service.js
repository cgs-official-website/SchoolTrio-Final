import { prisma } from '../../database/prisma.client.js';
import * as lessonPlanRepository from './lesson-plan.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { calculateWeekNumber } from './lesson-plan.schemas.js';
import { getMyTeacherClasses } from '../classes/class.service.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { hasAdminPanelScope } from '../../utils/access-scope.js';

const ADMIN_ROLE_SET = new Set([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'CORRESPONDENT',
  'ADMINISTRATIVE_OFFICER',
  'ADMINISTRATIVE-OFFICER',
  'VICE_PRINCIPAL',
  'VICE-PRINCIPAL',
  'ADMIN'
]);

/**
 * Checks if the authenticated actor possesses administrative privileges.
 *
 * @param {Object} actor - Authenticated user context
 * @returns {boolean}
 */
export function isLessonPlanAdmin(actor) {
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
 * Resolves teacher StaffProfile and verifies active status.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object>} Active StaffProfile
 */
export async function resolveTeacherProfile(schoolId, actor, tx = prisma) {
  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user ID missing');
  }

  const profile = await lessonPlanRepository.findStaffProfileByUserId(schoolId, userId, tx);
  if (!profile) {
    throw new ForbiddenError('Staff profile not found for authenticated teacher');
  }

  if (profile.user?.isActive === false || profile.status === 'Inactive' || profile.status === 'deactivated') {
    throw new ForbiddenError('Teacher account is deactivated or inactive');
  }

  return profile;
}


/**
 * Collects the subject ids a teacher handles: subjects assigned in the staff directory
 * (customData.assignments.assignedSubjectIds) plus subjects the teacher is scheduled for in the timetable.
 *
 * @param {string} schoolId
 * @param {Object} profile - StaffProfile
 * @returns {Promise<Array<string>>}
 */
async function collectTeacherSubjectIds(schoolId, profile) {
  const custom = profile.customData || {};
  const assignments = custom.assignments || {};
  const ids = new Set();

  [
    ...(Array.isArray(assignments.assignedSubjectIds) ? assignments.assignedSubjectIds : []),
    ...(Array.isArray(custom.assignedSubjectIds) ? custom.assignedSubjectIds : [])
  ].forEach(id => id && typeof id === 'string' && ids.add(id));

  const periods = await prisma.timetablePeriod.findMany({
    where: { schoolId, teacherId: profile.id, subjectId: { not: null } },
    select: { subjectId: true },
    distinct: ['subjectId']
  });
  periods.forEach(p => p.subjectId && ids.add(p.subjectId));

  return Array.from(ids);
}

/**
 * Flattens classes (with their sections) into selectable class/section units.
 */
function flattenUnits(classes = []) {
  const units = [];
  for (const c of classes) {
    const sections = Array.isArray(c.sections) ? c.sections : [];
    if (sections.length === 0) {
      units.push({
        classId: c.id,
        className: c.name,
        sectionId: null,
        sectionName: null,
        label: c.name,
        isClassTeacher: false
      });
      continue;
    }
    for (const sec of sections) {
      units.push({
        classId: c.id,
        className: c.name,
        sectionId: sec.id,
        sectionName: sec.name,
        label: `${c.name} - Section ${sec.name}`,
        isClassTeacher: Boolean(sec.isClassTeacher)
      });
    }
  }
  return units;
}

/**
 * Returns the class/section units and subjects the actor may create lesson plans for.
 * - Admins: every class/section and every subject.
 * - Teachers: only the sections they are class teacher of / teach, and only the subjects they handle.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ restricted: boolean, units: Array<Object>, subjects: Array<Object> }>}
 */
export async function getLessonPlanScope(schoolId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to load lesson plan scope');
  }

  if (isLessonPlanAdmin(actor)) {
    const [classes, subjects] = await Promise.all([
      prisma.class.findMany({
        where: { schoolId },
        include: { sections: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
        orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }]
      }),
      prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' }
      })
    ]);
    return { restricted: false, units: flattenUnits(classes), subjects };
  }

  const profile = await resolveTeacherProfile(schoolId, actor);
  const teacherActor = {
    id: actor.id || actor.userId,
    userId: actor.id || actor.userId,
    systemRole: SYSTEM_ROLES.TEACHER
  };

  const [classes, subjectIds] = await Promise.all([
    getMyTeacherClasses(schoolId, teacherActor, {}),
    collectTeacherSubjectIds(schoolId, profile)
  ]);

  const subjects = subjectIds.length > 0
    ? await prisma.subject.findMany({
      where: { schoolId, id: { in: subjectIds } },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' }
    })
    : [];

  return { restricted: true, units: flattenUnits(classes), subjects };
}

/**
 * Ensures a teacher only plans for a class/section and subject they handle.
 * Admins are not restricted.
 */
async function assertWithinTeacherScope(schoolId, actor, { classId, sectionId, subjectId, checkClass = true, checkSubject = true }) {
  if (isLessonPlanAdmin(actor)) return null;

  const scope = await getLessonPlanScope(schoolId, actor);

  let unit = null;
  if (checkClass) {
    unit = scope.units.find(u => u.classId === classId && (sectionId ? u.sectionId === sectionId : true)) || null;
    if (!unit) {
      throw new ForbiddenError('You can create lesson plans only for the classes/sections you handle');
    }
  }

  if (checkSubject && !scope.subjects.some(s => s.id === subjectId)) {
    throw new ForbiddenError('You can create lesson plans only for the subjects you handle');
  }

  return unit;
}

/**
 * Normalizes and formats a LessonPlan database entity into the authoritative REST DTO.
 *
 * @param {Object|null} lp - Raw LessonPlan entity
 * @returns {Object|null} Formatted LessonPlan DTO
 */
export function formatLessonPlanDto(lp) {
  if (!lp) return null;

  let dateValue = null;
  if (lp.customData && typeof lp.customData === 'object' && typeof lp.customData.date === 'string') {
    dateValue = lp.customData.date;
  }

  return {
    id: lp.id,
    schoolId: lp.schoolId,
    teacherId: lp.teacherId,
    teacherName: lp.teacher?.name || '',
    classId: lp.classId,
    className: lp.class?.name || '',
    sectionId: (lp.customData && typeof lp.customData === 'object' && lp.customData.sectionId) || null,
    sectionName: (lp.customData && typeof lp.customData === 'object' && lp.customData.sectionName) || null,
    subjectId: lp.subjectId,
    subjectName: lp.subject?.name || '',
    topic: lp.topics || '',
    date: dateValue,
    status: (lp.status || 'draft').toLowerCase(),
    objectives: lp.objectives || null,
    weekNumber: lp.weekNumber,
    createdAt: lp.createdAt,
    updatedAt: lp.updatedAt
  };
}

/**
 * Creates a new Lesson Plan.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} payload - Validated create payload
 * @returns {Promise<Object>} Created LessonPlan DTO
 */
export async function createLessonPlan(schoolId, actor, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create lesson plan');
  }

  const isAdmin = isLessonPlanAdmin(actor);
  let resolvedTeacherId;

  if (isAdmin) {
    if (payload.teacherId) {
      const staffProfile = await lessonPlanRepository.findStaffProfileById(schoolId, payload.teacherId);
      if (!staffProfile) {
        throw new NotFoundError('Teacher staff profile not found in current school');
      }
      resolvedTeacherId = staffProfile.id;
    } else {
      const adminProfile = await lessonPlanRepository.findStaffProfileByUserId(
        schoolId,
        actor.id || actor.userId
      );
      if (!adminProfile) {
        throw new ValidationError(
          'teacherId is required when creating a lesson plan as an administrator without a staff profile'
        );
      }
      resolvedTeacherId = adminProfile.id;
    }
  } else {
    const teacherProfile = await resolveTeacherProfile(schoolId, actor);
    resolvedTeacherId = teacherProfile.id;
  }

  // Validate class belongs to tenant
  const classRecord = await lessonPlanRepository.findClassById(schoolId, payload.classId);
  if (!classRecord) {
    throw new NotFoundError('Class not found in current school');
  }

  // Teachers may only plan for their own class/section and subjects
  const scopedUnit = await assertWithinTeacherScope(schoolId, actor, {
    classId: payload.classId,
    sectionId: payload.sectionId || null,
    subjectId: payload.subjectId
  });

  // Validate subject belongs to tenant
  const subjectRecord = await lessonPlanRepository.findSubjectById(schoolId, payload.subjectId);
  if (!subjectRecord) {
    throw new NotFoundError('Subject not found in current school');
  }

  // Derive weekNumber exclusively from date
  const weekNumber = calculateWeekNumber(payload.date);

  const resolvedSectionId = payload.sectionId || scopedUnit?.sectionId || null;
  let resolvedSectionName = scopedUnit?.sectionName || null;
  if (resolvedSectionId && !resolvedSectionName) {
    const sec = await prisma.section.findFirst({
      where: { id: resolvedSectionId, schoolId, classId: payload.classId },
      select: { name: true }
    });
    if (!sec) {
      throw new NotFoundError('Section not found in the selected class');
    }
    resolvedSectionName = sec.name;
  }

  const customData = {
    date: payload.date,
    ...(resolvedSectionId ? { sectionId: resolvedSectionId, sectionName: resolvedSectionName } : {})
  };

  const createdRecord = await lessonPlanRepository.createLessonPlan(schoolId, {
    teacherId: resolvedTeacherId,
    classId: payload.classId,
    subjectId: payload.subjectId,
    weekNumber,
    status: payload.status || 'draft',
    topic: payload.topic,
    objectives: payload.objectives || null,
    customData
  });

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LessonPlan',
    entityId: createdRecord.id,
    actionPerformed: 'LESSON_PLAN_CREATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'TEACHER',
    modifiedFields: {
      topic: createdRecord.topics,
      classId: createdRecord.classId,
      subjectId: createdRecord.subjectId,
      date: payload.date,
      status: createdRecord.status
    }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record lesson plan creation audit log:', err.message);
  });

  return formatLessonPlanDto(createdRecord);
}

/**
 * Lists Lesson Plans for tenant with filtering, RBAC custody enforcement, and pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
 */
export async function listLessonPlans(schoolId, actor, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list lesson plans');
  }

  const isAdmin = isLessonPlanAdmin(actor);
  const filters = { ...query };

  if (isAdmin) {
    // Admin may filter by teacherId if supplied, otherwise tenant-wide
    if (query.teacherId) {
      filters.teacherId = query.teacherId;
    }
  } else {
    // Operational roles forced to own custody
    const teacherProfile = await resolveTeacherProfile(schoolId, actor);
    filters.teacherId = teacherProfile.id;
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  filters.page = page;
  filters.limit = limit;

  const { data, total } = await lessonPlanRepository.findLessonPlans(schoolId, filters);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: data.map(formatLessonPlanDto),
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
 * Retrieves a single Lesson Plan by ID with tenant & ownership custody enforcement.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - LessonPlan UUID
 * @returns {Promise<Object>} LessonPlan DTO
 */
export async function getLessonPlanById(schoolId, actor, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get lesson plan');
  }
  if (!id) {
    throw new ValidationError('Lesson plan ID is required');
  }

  const lessonPlan = await lessonPlanRepository.findLessonPlanById(schoolId, id);
  if (!lessonPlan) {
    throw new NotFoundError('Lesson plan not found');
  }

  const isAdmin = isLessonPlanAdmin(actor);
  if (!isAdmin) {
    const teacherProfile = await resolveTeacherProfile(schoolId, actor);
    if (lessonPlan.teacherId !== teacherProfile.id) {
      throw new ForbiddenError('You are only authorized to view your own lesson plans');
    }
  }

  return formatLessonPlanDto(lessonPlan);
}

/**
 * Updates an existing Lesson Plan within a database transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - LessonPlan UUID
 * @param {Object} payload - Validated update payload
 * @returns {Promise<Object>} Updated LessonPlan DTO
 */
export async function updateLessonPlan(schoolId, actor, id, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update lesson plan');
  }
  if (!id) {
    throw new ValidationError('Lesson plan ID is required');
  }

  const isAdmin = isLessonPlanAdmin(actor);
  let teacherProfile = null;
  if (!isAdmin) {
    teacherProfile = await resolveTeacherProfile(schoolId, actor);
  }

  const updatedRecord = await prisma.$transaction(async tx => {
    // 1. Fetch authoritative record with lock or query
    const existing = await lessonPlanRepository.findLessonPlanByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Lesson plan not found');
    }

    // 2. Ownership custody check for operational users
    if (!isAdmin) {
      if (existing.teacherId !== teacherProfile.id) {
        throw new ForbiddenError('You are only authorized to update your own lesson plans');
      }
      if (payload.teacherId && payload.teacherId !== teacherProfile.id) {
        throw new ForbiddenError('Operational users cannot reassign lesson plan ownership');
      }
    }

    const updateData = {};

    // 3. Admin teacherId reassignment
    if (isAdmin && payload.teacherId) {
      const staffRecord = await lessonPlanRepository.findStaffProfileById(schoolId, payload.teacherId, tx);
      if (!staffRecord) {
        throw new NotFoundError('Target teacher staff profile not found in current school');
      }
      updateData.teacherId = staffRecord.id;
    }

    // 3b. Teachers may only move a plan to a class/section/subject they handle
    if (!isAdmin) {
      const existingCustom = existing.customData && typeof existing.customData === 'object' ? existing.customData : {};
      const classChanged = Boolean(payload.classId) && payload.classId !== existing.classId;
      const sectionChanged = payload.sectionId !== undefined && (payload.sectionId || null) !== (existingCustom.sectionId || null);
      const subjectChanged = Boolean(payload.subjectId) && payload.subjectId !== existing.subjectId;
      if (classChanged || sectionChanged || subjectChanged) {
        await assertWithinTeacherScope(schoolId, actor, {
          classId: payload.classId || existing.classId,
          sectionId: payload.sectionId !== undefined ? payload.sectionId : (existingCustom.sectionId || null),
          subjectId: payload.subjectId || existing.subjectId,
          checkClass: classChanged || sectionChanged,
          checkSubject: subjectChanged
        });
      }
    }

    // 4. Class verification
    if (payload.classId) {
      const classRecord = await lessonPlanRepository.findClassById(schoolId, payload.classId, tx);
      if (!classRecord) {
        throw new NotFoundError('Class not found in current school');
      }
      updateData.classId = payload.classId;
    }

    // 5. Subject verification
    if (payload.subjectId) {
      const subjectRecord = await lessonPlanRepository.findSubjectById(schoolId, payload.subjectId, tx);
      if (!subjectRecord) {
        throw new NotFoundError('Subject not found in current school');
      }
      updateData.subjectId = payload.subjectId;
    }

    // 6. Topic & objectives
    if (payload.topic !== undefined) {
      updateData.topic = payload.topic;
    }
    if (payload.objectives !== undefined) {
      updateData.objectives = payload.objectives;
    }

    // 7. Status update
    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }

    // 8. Date, section & weekNumber
    if (payload.date || payload.sectionId !== undefined) {
      const existingCustomData =
        existing.customData && typeof existing.customData === 'object' ? existing.customData : {};
      const nextCustomData = { ...existingCustomData };
      if (payload.date) {
        nextCustomData.date = payload.date;
        updateData.weekNumber = calculateWeekNumber(payload.date);
      }
      if (payload.sectionId !== undefined) {
        if (payload.sectionId) {
          const sec = await tx.section.findFirst({
            where: { id: payload.sectionId, schoolId, classId: payload.classId || existing.classId },
            select: { name: true }
          });
          if (!sec) {
            throw new NotFoundError('Section not found in the selected class');
          }
          nextCustomData.sectionId = payload.sectionId;
          nextCustomData.sectionName = sec.name;
        } else {
          delete nextCustomData.sectionId;
          delete nextCustomData.sectionName;
        }
      }
      updateData.customData = nextCustomData;
    }

    return lessonPlanRepository.updateLessonPlan(schoolId, id, updateData, tx);
  });

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LessonPlan',
    entityId: updatedRecord.id,
    actionPerformed: 'LESSON_PLAN_UPDATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: payload
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record lesson plan update audit log:', err.message);
  });

  return formatLessonPlanDto(updatedRecord);
}

/**
 * Deletes a Lesson Plan within a database transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - LessonPlan UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteLessonPlan(schoolId, actor, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete lesson plan');
  }
  if (!id) {
    throw new ValidationError('Lesson plan ID is required');
  }

  const isAdmin = isLessonPlanAdmin(actor);
  let teacherProfile = null;
  if (!isAdmin) {
    teacherProfile = await resolveTeacherProfile(schoolId, actor);
  }

  await prisma.$transaction(async tx => {
    const existing = await lessonPlanRepository.findLessonPlanByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Lesson plan not found');
    }

    if (!isAdmin) {
      if (existing.teacherId !== teacherProfile.id) {
        throw new ForbiddenError('You are only authorized to delete your own lesson plans');
      }
    }

    return lessonPlanRepository.deleteLessonPlan(schoolId, id, tx);
  });

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LessonPlan',
    entityId: id,
    actionPerformed: 'LESSON_PLAN_DELETED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: { id }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record lesson plan deletion audit log:', err.message);
  });

  return {
    success: true,
    message: 'Lesson plan deleted successfully'
  };
}