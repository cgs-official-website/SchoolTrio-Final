import * as timetableRepository from './timetable.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../utils/app-error.js';
import {
  DAY_OF_WEEK_TO_NAME,
  normalizeDayOfWeek,
  isEndTimeAfterStartTime
} from './timetable.schemas.js';

/**
 * Normalizes a raw Prisma TimetablePeriod record into a safe, client-friendly DTO.
 *
 * @param {Object} period - Raw database record with joined relations
 * @returns {Object|null}
 */
export function formatPeriod(period) {
  if (!period) return null;

  const dayOfWeek = period.dayOfWeek;
  const day = DAY_OF_WEEK_TO_NAME[dayOfWeek] || 'Monday';

  return {
    id: period.id,
    schoolId: period.schoolId,
    classId: period.classId,
    className: period.class?.name || null,
    sectionId: period.sectionId || null,
    sectionName: period.section?.name || null,
    subjectId: period.subjectId || null,
    subjectName: period.subject?.name || null,
    subjectCode: period.subject?.code || null,
    teacherId: period.teacherId || null,
    teacherName: period.teacher?.name || null,
    teacherEmail: period.teacher?.email || null,
    dayOfWeek,
    day,
    periodNumber: period.periodNumber,
    startTime: period.startTime,
    endTime: period.endTime,
    roomNumber: period.roomNumber || null,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
    class: period.class
      ? {
          id: period.class.id,
          name: period.class.name
        }
      : null,
    section: period.section
      ? {
          id: period.section.id,
          name: period.section.name
        }
      : null,
    subject: period.subject
      ? {
          id: period.subject.id,
          name: period.subject.name,
          code: period.subject.code || null
        }
      : null,
    teacher: period.teacher
      ? {
          id: period.teacher.id,
          name: period.teacher.name,
          email: period.teacher.email || null,
          phone: period.teacher.phone || null
        }
      : null
  };
}

/**
 * Builds a structured weekly schedule map (Monday..Saturday) from an array of periods.
 *
 * @param {Array<Object>} periods
 * @returns {Record<string, Array<Object>>}
 */
export function formatScheduleGrid(periods = []) {
  const grid = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: []
  };

  for (const p of periods) {
    const dayName = DAY_OF_WEEK_TO_NAME[p.dayOfWeek] || 'Monday';
    if (!grid[dayName]) {
      grid[dayName] = [];
    }
    grid[dayName].push(formatPeriod(p));
  }

  // Ensure sorting by startTime ascending within each day
  for (const day of Object.keys(grid)) {
    grid[day].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }

  return grid;
}

/**
 * Checks if actor is a Parent.
 */
function isParent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.PARENT || role === 'PARENT';
}

/**
 * Checks if actor is a Student.
 */
function isStudent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.STUDENT || role === 'STUDENT';
}

/**
 * Resolves teacher StaffProfile and verifies active status.
 */
async function resolveTeacherProfile(schoolId, actor, tx) {
  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user ID missing');
  }

  const profile = await timetableRepository.findStaffProfileByUserId(schoolId, userId, tx);
  if (!profile) {
    throw new ForbiddenError('Staff profile not found for authenticated teacher');
  }

  if (profile.user?.isActive === false || profile.status === 'Inactive') {
    throw new ForbiddenError('Teacher account is deactivated or inactive');
  }

  return profile;
}

/**
 * Lists timetable periods with role and tenant scoping.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [query={}] - Validated query filters
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<Array<Object>>}
 */
export async function listTimetables(schoolId, query = {}, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list timetables');
  }

  const filterOptions = {
    classId: query.classId,
    teacherId: query.teacherId,
    subjectId: query.subjectId,
    sectionId: query.sectionId,
    dayOfWeek: query.dayOfWeek
  };

  // 1. Parent Scope Enforcement
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const authorizedClassIds = await timetableRepository.findAuthorizedClassIdsForParent(schoolId, userId);

    if (authorizedClassIds.length === 0) {
      return [];
    }

    if (filterOptions.classId) {
      if (!authorizedClassIds.includes(filterOptions.classId)) {
        return [];
      }
    } else if (authorizedClassIds.length === 1) {
      filterOptions.classId = authorizedClassIds[0];
    }
  }

  // 2. Student Scope Enforcement
  if (isStudent(actor)) {
    const userId = actor.id || actor.userId;
    const student = await timetableRepository.findStudentByUserId(schoolId, userId);

    if (!student || !student.classId) {
      return [];
    }

    if (filterOptions.classId && filterOptions.classId !== student.classId) {
      return [];
    }

    filterOptions.classId = student.classId;
  }

  const periods = await timetableRepository.findTimetablePeriods(schoolId, filterOptions);
  return periods.map(formatPeriod);
}

/**
 * Gets a structured weekly timetable for a specific class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<Object>}
 */
export async function getClassTimetable(schoolId, classId, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get class timetable');
  }

  const targetClass = await timetableRepository.findClassInTenant(schoolId, classId);
  if (!targetClass) {
    throw new NotFoundError('Class not found for active school');
  }

  // Parent Authorization Check
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const authorizedClassIds = await timetableRepository.findAuthorizedClassIdsForParent(schoolId, userId);
    if (!authorizedClassIds.includes(classId)) {
      throw new NotFoundError('Class not found for active school');
    }
  }

  // Student Authorization Check
  if (isStudent(actor)) {
    const userId = actor.id || actor.userId;
    const student = await timetableRepository.findStudentByUserId(schoolId, userId);
    if (!student || student.classId !== classId) {
      throw new NotFoundError('Class not found for active school');
    }
  }

  const periods = await timetableRepository.findTimetablePeriods(schoolId, { classId });
  const schedule = formatScheduleGrid(periods);

  return {
    classId: targetClass.id,
    className: targetClass.name,
    classTeacherId: targetClass.classTeacherId || null,
    classTeacherName: targetClass.classTeacher?.name || null,
    schedule,
    periods: periods.map(formatPeriod)
  };
}

/**
 * Creates a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Period payload
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<Object>}
 */
export async function createTimetablePeriod(schoolId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create timetable period');
  }

  // 1. Verify class in tenant
  const targetClass = await timetableRepository.findClassInTenant(schoolId, data.classId);
  if (!targetClass) {
    throw new NotFoundError('Class not found for active school');
  }

  // 2. Verify section if provided
  if (data.sectionId) {
    const targetSection = await timetableRepository.findSectionInTenant(schoolId, data.sectionId, data.classId);
    if (!targetSection) {
      throw new NotFoundError('Section not found for active school and class');
    }
  }

  // 3. Verify subject if provided
  if (data.subjectId) {
    const targetSubject = await timetableRepository.findSubjectInTenant(schoolId, data.subjectId);
    if (!targetSubject) {
      throw new NotFoundError('Subject not found for active school');
    }
  }

  // 4. Verify teacher if provided
  if (data.teacherId) {
    const targetTeacher = await timetableRepository.findTeacherInTenant(schoolId, data.teacherId);
    if (!targetTeacher) {
      throw new NotFoundError('Teacher not found for active school');
    }
  }

  const created = await timetableRepository.createTimetablePeriod(schoolId, data);

  createAuditLog({
    schoolId,
    entityType: 'TimetablePeriod',
    entityId: created.id,
    actionPerformed: 'CREATE_TIMETABLE_PERIOD',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      classId: created.classId,
      subjectId: created.subjectId,
      teacherId: created.teacherId,
      dayOfWeek: created.dayOfWeek,
      startTime: created.startTime,
      endTime: created.endTime
    }
  }).catch(() => {});

  return formatPeriod(created);
}

/**
 * Updates a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<Object>}
 */
export async function updateTimetablePeriod(schoolId, id, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update timetable period');
  }

  const existing = await timetableRepository.findTimetablePeriodById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Timetable period not found for active school');
  }

  const effectiveClassId = data.classId || existing.classId;

  // 1. Verify class if changed
  if (data.classId && data.classId !== existing.classId) {
    const targetClass = await timetableRepository.findClassInTenant(schoolId, data.classId);
    if (!targetClass) {
      throw new NotFoundError('Class not found for active school');
    }
  }

  // 2. Verify section if provided
  if (data.sectionId) {
    const targetSection = await timetableRepository.findSectionInTenant(schoolId, data.sectionId, effectiveClassId);
    if (!targetSection) {
      throw new NotFoundError('Section not found for active school and class');
    }
  }

  // 3. Verify subject if provided
  if (data.subjectId) {
    const targetSubject = await timetableRepository.findSubjectInTenant(schoolId, data.subjectId);
    if (!targetSubject) {
      throw new NotFoundError('Subject not found for active school');
    }
  }

  // 4. Verify teacher if provided
  if (data.teacherId) {
    const targetTeacher = await timetableRepository.findTeacherInTenant(schoolId, data.teacherId);
    if (!targetTeacher) {
      throw new NotFoundError('Teacher not found for active school');
    }
  }

  // 5. Cross-field time validation if one time is updated
  const effectiveStart = data.startTime || existing.startTime;
  const effectiveEnd = data.endTime || existing.endTime;
  if (!isEndTimeAfterStartTime(effectiveStart, effectiveEnd)) {
    throw new ValidationError('endTime must be later than startTime');
  }

  const updated = await timetableRepository.updateTimetablePeriod(schoolId, id, data);

  createAuditLog({
    schoolId,
    entityType: 'TimetablePeriod',
    entityId: updated.id,
    actionPerformed: 'UPDATE_TIMETABLE_PERIOD',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: data
  }).catch(() => {});

  return formatPeriod(updated);
}

/**
 * Deletes a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<{ message: string, id: string }>}
 */
export async function deleteTimetablePeriod(schoolId, id, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete timetable period');
  }

  const existing = await timetableRepository.findTimetablePeriodById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Timetable period not found for active school');
  }

  await timetableRepository.deleteTimetablePeriod(schoolId, id);

  createAuditLog({
    schoolId,
    entityType: 'TimetablePeriod',
    entityId: id,
    actionPerformed: 'DELETE_TIMETABLE_PERIOD',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      deletedPeriod: {
        classId: existing.classId,
        subjectId: existing.subjectId,
        teacherId: existing.teacherId,
        dayOfWeek: existing.dayOfWeek,
        startTime: existing.startTime,
        endTime: existing.endTime
      }
    }
  }).catch(() => {});

  return {
    message: 'Timetable period deleted successfully',
    id
  };
}

/**
 * Replaces the entire weekly timetable for a class atomically in a transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} payload - { schedule: { Monday: [...] }, periods: [...], customData: {} }
 * @param {Object} [actor={}] - Authenticated actor
 * @returns {Promise<Object>} Formatted weekly schedule
 */
export async function replaceClassTimetable(schoolId, classId, payload = {}, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to replace class timetable');
  }

  // 1. Verify target class exists in tenant
  const targetClass = await timetableRepository.findClassInTenant(schoolId, classId);
  if (!targetClass) {
    throw new NotFoundError('Class not found for active school');
  }

  // 2. Flatten and normalize incoming slots from schedule map or periods array
  const rawSlots = [];

  if (payload.schedule && typeof payload.schedule === 'object') {
    for (const [dayKey, slots] of Object.entries(payload.schedule)) {
      const normalizedDay = normalizeDayOfWeek(dayKey);
      if (!normalizedDay) continue;

      if (Array.isArray(slots)) {
        slots.forEach((slot, index) => {
          rawSlots.push({
            ...slot,
            dayOfWeek: normalizedDay,
            periodNumber: slot.periodNumber || index + 1
          });
        });
      }
    }
  } else if (Array.isArray(payload.periods)) {
    payload.periods.forEach((slot, index) => {
      const normalizedDay = normalizeDayOfWeek(slot.dayOfWeek || slot.day);
      if (normalizedDay) {
        rawSlots.push({
          ...slot,
          dayOfWeek: normalizedDay,
          periodNumber: slot.periodNumber || index + 1
        });
      }
    });
  }

  // 3. Pre-transaction validation of all referenced entities and times
  const validatedPeriods = [];

  for (let i = 0; i < rawSlots.length; i++) {
    const slot = rawSlots[i];

    if (!slot.startTime || !slot.endTime) {
      throw new ValidationError(`Period at index ${i} is missing startTime or endTime`);
    }

    if (!isEndTimeAfterStartTime(slot.startTime, slot.endTime)) {
      throw new ValidationError(`Period at index ${i} has endTime earlier than or equal to startTime (${slot.startTime} - ${slot.endTime})`);
    }

    // Verify section if provided
    if (slot.sectionId) {
      const section = await timetableRepository.findSectionInTenant(schoolId, slot.sectionId, classId);
      if (!section) {
        throw new NotFoundError(`Section '${slot.sectionId}' not found for class in active school`);
      }
    }

    // Verify subject if provided
    if (slot.subjectId) {
      const subject = await timetableRepository.findSubjectInTenant(schoolId, slot.subjectId);
      if (!subject) {
        throw new NotFoundError(`Subject '${slot.subjectId}' not found in active school`);
      }
    }

    // Verify teacher if provided
    if (slot.teacherId) {
      const teacher = await timetableRepository.findTeacherInTenant(schoolId, slot.teacherId);
      if (!teacher) {
        throw new NotFoundError(`Teacher '${slot.teacherId}' not found in active school`);
      }
    }

    validatedPeriods.push({
      classId,
      sectionId: slot.sectionId || null,
      subjectId: slot.subjectId || null,
      teacherId: slot.teacherId || null,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber || 1,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomNumber: slot.roomNumber || null
    });
  }

  // 4. Execute atomic replacement inside transaction
  const savedPeriods = await timetableRepository.runTransaction(async (tx) => {
    return timetableRepository.replaceClassTimetable(schoolId, classId, validatedPeriods, tx);
  });

  createAuditLog({
    schoolId,
    entityType: 'ClassTimetable',
    entityId: classId,
    actionPerformed: 'REPLACE_CLASS_TIMETABLE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      classId,
      periodCount: validatedPeriods.length
    }
  }).catch(() => {});

  const schedule = formatScheduleGrid(savedPeriods);

  return {
    classId: targetClass.id,
    className: targetClass.name,
    classTeacherId: targetClass.classTeacherId || null,
    classTeacherName: targetClass.classTeacher?.name || null,
    schedule,
    periods: savedPeriods.map(formatPeriod)
  };
}

/**
 * Returns the authenticated teacher's subject schedule and class teacher schedule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated teacher
 * @returns {Promise<Object>}
 */
export async function getMySchedule(schoolId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get teacher schedule');
  }

  const teacherProfile = await resolveTeacherProfile(schoolId, actor);

  // 1. Fetch Subject Teacher Periods (where teacherId matches authenticated teacher)
  const subjectPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
    teacherId: teacherProfile.id
  });

  // 2. Fetch Class Teacher Periods (if assigned as class teacher)
  let classPeriods = [];
  let assignedClassName = null;

  if (teacherProfile.assignedClassId) {
    classPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
      classId: teacherProfile.assignedClassId
    });
    assignedClassName = teacherProfile.assignedClass?.name || null;
  }

  return {
    teacherId: teacherProfile.id,
    teacherName: teacherProfile.name,
    isClassTeacher: Boolean(teacherProfile.assignedClassId),
    assignedClassId: teacherProfile.assignedClassId || null,
    assignedClassName,
    subjectSchedule: formatScheduleGrid(subjectPeriods),
    classSchedule: formatScheduleGrid(classPeriods),
    subjectPeriods: subjectPeriods.map(formatPeriod),
    classPeriods: classPeriods.map(formatPeriod)
  };
}
