import * as timetableRepository from './timetable.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError
} from '../../utils/app-error.js';
import {
  DAY_OF_WEEK_TO_NAME,
  normalizeDayOfWeek,
  isEndTimeAfterStartTime,
  areTimeIntervalsOverlapping,
  timeToMinutes
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
    templateSlotId: period.templateSlotId || null,
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

export function formatTemplate(template) {
  if (!template) return null;
  return {
    id: template.id,
    name: template.name,
    slots: (template.slots || []).map((s) => ({
      id: s.id,
      slotOrder: s.slotOrder,
      slotType: s.slotType,
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime
    }))
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Narrows a list of periods to the ones a given section should see.
 *
 * Each section of a class owns its timetable (its own subjects / teachers / periods).
 * For every class in `periods`:
 *   - if the viewer's section(s) have periods of their own -> only those are returned;
 *   - otherwise the legacy shared (section-less) periods are returned as a fallback, so
 *     timetables created before per-section support keep working until they are re-saved.
 *
 * @param {Array<Object>} periods - Raw periods (with classId / sectionId)
 * @param {Array<string>} sectionIds - Section ids of the viewer
 * @returns {Array<Object>}
 */
export function pickSectionPeriods(periods = [], sectionIds = []) {
  const wanted = new Set((sectionIds || []).filter(Boolean));
  const byClass = new Map();
  for (const p of periods) {
    if (!byClass.has(p.classId)) byClass.set(p.classId, []);
    byClass.get(p.classId).push(p);
  }

  const result = [];
  for (const classPeriods of byClass.values()) {
    const own = classPeriods.filter((p) => p.sectionId && wanted.has(p.sectionId));
    if (own.length > 0) {
      result.push(...own);
    } else {
      result.push(...classPeriods.filter((p) => !p.sectionId));
    }
  }
  return result;
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

  let scopedSectionIds = null;

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

    // Parents only see the timetable of the section(s) their children attend
    const parentSectionIds = await timetableRepository.findAuthorizedSectionIdsForParent(
      schoolId,
      userId,
      filterOptions.classId || null
    );
    scopedSectionIds = parentSectionIds;
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
    scopedSectionIds = student.sectionId ? [student.sectionId] : [];
  }

  let periods = await timetableRepository.findTimetablePeriods(schoolId, filterOptions);

  // Students / parents: only their own section's timetable (not every section of the class)
  if (scopedSectionIds && !filterOptions.sectionId) {
    periods = pickSectionPeriods(periods, scopedSectionIds);
  }

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
export async function getClassTimetable(schoolId, classId, actor = {}, options = {}) {
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

  // Resolve which section's timetable is requested
  let scopedSectionIds = null;
  let targetSection = null;

  if (options.sectionId) {
    if (!UUID_RE.test(options.sectionId)) {
      throw new ValidationError('sectionId must be a valid UUID');
    }
    targetSection = await timetableRepository.findSectionInTenant(schoolId, options.sectionId, classId);
    if (!targetSection) {
      throw new NotFoundError('Section not found for this class');
    }
    scopedSectionIds = [targetSection.id];
  }

  // Student Authorization Check (students are always pinned to their own section)
  if (isStudent(actor)) {
    const userId = actor.id || actor.userId;
    const student = await timetableRepository.findStudentByUserId(schoolId, userId);
    if (!student || student.classId !== classId) {
      throw new NotFoundError('Class not found for active school');
    }
    scopedSectionIds = student.sectionId ? [student.sectionId] : [];
  }

  // Parents are limited to the section(s) of their own children
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const childSectionIds = await timetableRepository.findAuthorizedSectionIdsForParent(schoolId, userId, classId);
    scopedSectionIds = scopedSectionIds
      ? scopedSectionIds.filter((id) => childSectionIds.includes(id))
      : childSectionIds;
  }

  let periods = await timetableRepository.findTimetablePeriods(schoolId, { classId });
  if (scopedSectionIds) {
    periods = pickSectionPeriods(periods, scopedSectionIds);
  }
  const schedule = formatScheduleGrid(periods);

  // Class teacher of the requested section (falls back to the class-level teacher)
  const sectionTeacher = targetSection
    ? await timetableRepository.findSectionClassTeacher(schoolId, targetSection.id)
    : null;

  return {
    classId: targetClass.id,
    className: targetClass.name,
    sectionId: targetSection?.id || null,
    sectionName: targetSection?.name || null,
    classTeacherId: sectionTeacher?.id || targetClass.classTeacherId || null,
    classTeacherName: sectionTeacher?.name || targetClass.classTeacher?.name || null,
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

  const normalizedDay = normalizeDayOfWeek(data.dayOfWeek ?? data.day);
  if (!normalizedDay) {
    throw new ValidationError('dayOfWeek (1-6 or valid day name) is required and must be valid');
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
  if (!data.teacherId) {
    throw new ValidationError('A teacher must be assigned to the period');
  }
  if (data.teacherId) {
    const targetTeacher = await timetableRepository.findTeacherInTenant(schoolId, data.teacherId);
    if (!targetTeacher) {
      throw new NotFoundError('Teacher not found for active school');
    }
  }

  // 5. Conflict Detection: Class period overlap
  const existingClassPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
    classId: data.classId,
    dayOfWeek: normalizedDay
  });
  for (const existing of existingClassPeriods) {
    if (areTimeIntervalsOverlapping(data.startTime, data.endTime, existing.startTime, existing.endTime)) {
      const dayName = DAY_OF_WEEK_TO_NAME[normalizedDay] || 'that day';
      throw new ConflictError(
        `Class schedule conflict: Class already has a period scheduled on ${dayName} from ${existing.startTime} to ${existing.endTime}. Periods within the same class cannot have overlapping time schedules.`
      );
    }
  }

  // 6. Conflict Detection: Teacher schedule overlap across all classes
  if (data.teacherId) {
    const existingTeacherPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
      teacherId: data.teacherId,
      dayOfWeek: normalizedDay
    });
    for (const existing of existingTeacherPeriods) {
      if (areTimeIntervalsOverlapping(data.startTime, data.endTime, existing.startTime, existing.endTime)) {
        const teacherName = existing.teacher?.name || 'The teacher';
        const conflictingClass = existing.class?.name
          ? `${existing.class.name}${existing.section?.name ? ` - Section ${existing.section.name}` : ''}`
          : 'another class';
        const dayName = DAY_OF_WEEK_TO_NAME[normalizedDay] || 'that day';
        throw new ConflictError(
          `Teacher schedule conflict: ${teacherName} is already assigned to ${conflictingClass} on ${dayName} from ${existing.startTime} to ${existing.endTime}. A teacher cannot be assigned to two different classes in the same time slot.`
        );
      }
    }
  }

  const created = await timetableRepository.createTimetablePeriod(schoolId, {
    ...data,
    dayOfWeek: normalizedDay
  });

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
  }).catch(() => { });

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
  if (data.teacherId !== undefined && !data.teacherId) {
    throw new ValidationError('A teacher must be assigned to the period');
  }
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

  const effectiveDay = data.dayOfWeek !== undefined ? (normalizeDayOfWeek(data.dayOfWeek) || existing.dayOfWeek) : existing.dayOfWeek;
  const effectiveTeacherId = data.teacherId !== undefined ? data.teacherId : existing.teacherId;

  // 6. Conflict Detection: Class period overlap (excluding current period)
  const existingClassPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
    classId: effectiveClassId,
    dayOfWeek: effectiveDay
  });
  for (const item of existingClassPeriods) {
    if (item.id !== id && areTimeIntervalsOverlapping(effectiveStart, effectiveEnd, item.startTime, item.endTime)) {
      const dayName = DAY_OF_WEEK_TO_NAME[effectiveDay] || 'that day';
      throw new ConflictError(
        `Class schedule conflict: Class already has a period scheduled on ${dayName} from ${item.startTime} to ${item.endTime}. Periods within the same class cannot have overlapping time schedules.`
      );
    }
  }

  // 7. Conflict Detection: Teacher schedule overlap across all classes (excluding current period)
  if (effectiveTeacherId) {
    const existingTeacherPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
      teacherId: effectiveTeacherId,
      dayOfWeek: effectiveDay
    });
    for (const item of existingTeacherPeriods) {
      if (item.id !== id && areTimeIntervalsOverlapping(effectiveStart, effectiveEnd, item.startTime, item.endTime)) {
        const teacherName = item.teacher?.name || 'The teacher';
        const conflictingClass = item.class?.name
          ? `${item.class.name}${item.section?.name ? ` - Section ${item.section.name}` : ''}`
          : 'another class';
        const dayName = DAY_OF_WEEK_TO_NAME[effectiveDay] || 'that day';
        throw new ConflictError(
          `Teacher schedule conflict: ${teacherName} is already assigned to ${conflictingClass} on ${dayName} from ${item.startTime} to ${item.endTime}. A teacher cannot be assigned to two different classes in the same time slot.`
        );
      }
    }
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
  }).catch(() => { });

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
  }).catch(() => { });

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

  // 1b. Section-scoped save: only this section's timetable is replaced
  let targetSection = null;
  if (payload.sectionId) {
    if (!UUID_RE.test(payload.sectionId)) {
      throw new ValidationError('sectionId must be a valid UUID');
    }
    targetSection = await timetableRepository.findSectionInTenant(schoolId, payload.sectionId, classId);
    if (!targetSection) {
      throw new NotFoundError(`Section '${payload.sectionId}' not found for class in active school`);
    }
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

  // Template slots: the source of truth for times of linked periods
  const templateRecord = await timetableRepository.findTemplate(schoolId);
  const templateSlotMap = new Map();
  let periodNo = 0;
  for (const ts of templateRecord?.slots || []) {
    if (ts.slotType === 'PERIOD') periodNo += 1;
    templateSlotMap.set(ts.id, { ...ts, periodNumber: periodNo });
  }

  for (let i = 0; i < rawSlots.length; i++) {
    const slot = { ...rawSlots[i] };

    if (slot.templateSlotId) {
      const tSlot = templateSlotMap.get(slot.templateSlotId);
      if (!tSlot) {
        throw new NotFoundError(`Template slot '${slot.templateSlotId}' not found in active school`);
      }
      if (tSlot.slotType !== 'PERIOD') {
        throw new ValidationError(`"${tSlot.label}" is a ${tSlot.slotType.toLowerCase()} and cannot have a subject or teacher`);
      }
      slot.startTime = tSlot.startTime;
      slot.endTime = tSlot.endTime;
      slot.periodNumber = tSlot.periodNumber;
    }

    if (!slot.startTime || !slot.endTime) {
      throw new ValidationError(`Period at index ${i} is missing startTime or endTime`);
    }

    if (!isEndTimeAfterStartTime(slot.startTime, slot.endTime)) {
      throw new ValidationError(`Period at index ${i} has endTime earlier than or equal to startTime (${slot.startTime} - ${slot.endTime})`);
    }

    // Verify section if provided (a section-scoped save forces every slot onto that section)
    if (!targetSection && slot.sectionId) {
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

    // A teacher must be assigned to every period
    if (!slot.teacherId) {
      throw new ValidationError(`Period at index ${i} requires a teacher to be assigned`);
    }

    // Verify teacher
    if (slot.teacherId) {
      const teacher = await timetableRepository.findTeacherInTenant(schoolId, slot.teacherId);
      if (!teacher) {
        throw new NotFoundError(`Teacher '${slot.teacherId}' not found in active school`);
      }
    }

    validatedPeriods.push({
      classId,
      sectionId: targetSection ? targetSection.id : (slot.sectionId || null),
      subjectId: slot.subjectId || null,
      teacherId: slot.teacherId || null,
      templateSlotId: slot.templateSlotId || null,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber || 1,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomNumber: slot.roomNumber || null
    });
  }

  // 3a. Conflict Detection: Overlapping periods within the same class
  for (let i = 0; i < validatedPeriods.length; i++) {
    for (let j = i + 1; j < validatedPeriods.length; j++) {
      const p1 = validatedPeriods[i];
      const p2 = validatedPeriods[j];
      if (p1.dayOfWeek === p2.dayOfWeek) {
        if (areTimeIntervalsOverlapping(p1.startTime, p1.endTime, p2.startTime, p2.endTime)) {
          const dayName = DAY_OF_WEEK_TO_NAME[p1.dayOfWeek] || 'that day';
          throw new ConflictError(
            `Class schedule conflict: Overlapping periods detected on ${dayName} (${p1.startTime}-${p1.endTime} and ${p2.startTime}-${p2.endTime}). Periods within the same class cannot have overlapping time schedules.`
          );
        }
      }
    }
  }

  // 3b. Conflict Detection: Overlapping periods for the same teacher within this schedule
  for (let i = 0; i < validatedPeriods.length; i++) {
    for (let j = i + 1; j < validatedPeriods.length; j++) {
      const p1 = validatedPeriods[i];
      const p2 = validatedPeriods[j];
      if (p1.teacherId && p2.teacherId && p1.teacherId === p2.teacherId && p1.dayOfWeek === p2.dayOfWeek) {
        if (areTimeIntervalsOverlapping(p1.startTime, p1.endTime, p2.startTime, p2.endTime)) {
          const dayName = DAY_OF_WEEK_TO_NAME[p1.dayOfWeek] || 'that day';
          throw new ConflictError(
            `Teacher schedule conflict: Teacher is assigned to overlapping periods on ${dayName} (${p1.startTime}-${p1.endTime} and ${p2.startTime}-${p2.endTime}). A teacher cannot be assigned to overlapping time slots.`
          );
        }
      }
    }
  }

  // 3c. Conflict Detection: Teacher already assigned to another class in overlapping time slot
  const teacherIds = Array.from(new Set(validatedPeriods.map(p => p.teacherId).filter(Boolean)));
  if (teacherIds.length > 0) {
    const allTeacherPeriods = await timetableRepository.findTimetablePeriods(schoolId, {
      teacherId: teacherIds
    });
    const existingTeacherPeriods = allTeacherPeriods.filter((e) => {
      if (e.classId !== classId) return true;           
      if (!targetSection) return false;                 
      return Boolean(e.sectionId) && e.sectionId !== targetSection.id;
    });

    for (const p of validatedPeriods) {
      if (!p.teacherId) continue;
      for (const existing of existingTeacherPeriods) {
        if (existing.teacherId === p.teacherId && existing.dayOfWeek === p.dayOfWeek) {
          if (areTimeIntervalsOverlapping(p.startTime, p.endTime, existing.startTime, existing.endTime)) {
            const teacherName = existing.teacher?.name || 'The teacher';
            const conflictingClass = existing.class?.name
              ? `${existing.class.name}${existing.section?.name ? ` - Section ${existing.section.name}` : ''}`
              : 'another class';
            const dayName = DAY_OF_WEEK_TO_NAME[p.dayOfWeek] || 'that day';
            throw new ConflictError(
              `Teacher schedule conflict: ${teacherName} is already assigned to ${conflictingClass} on ${dayName} from ${existing.startTime} to ${existing.endTime}. A teacher cannot be assigned to two different classes in the same time slot.`
            );
          }
        }
      }
    }
  }

  // 4. Execute atomic replacement inside transaction
  const savedPeriods = await timetableRepository.runTransaction(async (tx) => {
    return timetableRepository.replaceClassTimetable(schoolId, classId, validatedPeriods, tx, {
      sectionId: targetSection?.id || null
    });
  });

  // Return only what the saved section should see (its own periods, or the shared fallback)
  const visiblePeriods = targetSection ? pickSectionPeriods(savedPeriods, [targetSection.id]) : savedPeriods;

  createAuditLog({
    schoolId,
    entityType: 'ClassTimetable',
    entityId: classId,
    actionPerformed: 'REPLACE_CLASS_TIMETABLE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      classId,
      sectionId: targetSection?.id || null,
      periodCount: validatedPeriods.length
    }
  }).catch(() => { });

  const schedule = formatScheduleGrid(visiblePeriods);

  return {
    classId: targetClass.id,
    className: targetClass.name,
    sectionId: targetSection?.id || null,
    sectionName: targetSection?.name || null,
    classTeacherId: targetClass.classTeacherId || null,
    classTeacherName: targetClass.classTeacher?.name || null,
    schedule,
    periods: visiblePeriods.map(formatPeriod)
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

    // A class teacher heads ONE section (stored as the section id in assignments): show that
    // section's timetable, not the merged timetable of every section of the class.
    const assignedUnitId = teacherProfile.customData?.assignments?.assignedClassId;
    if (assignedUnitId && assignedUnitId !== teacherProfile.assignedClassId && UUID_RE.test(assignedUnitId)) {
      const headedSection = await timetableRepository.findSectionInTenant(
        schoolId,
        assignedUnitId,
        teacherProfile.assignedClassId
      );
      if (headedSection) {
        classPeriods = pickSectionPeriods(classPeriods, [headedSection.id]);
      }
    }
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

/**
 * Returns the school-wide period template (or null when not set up yet).
 */
export async function getTimetableTemplate(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get timetable template');
  }
  return formatTemplate(await timetableRepository.findTemplate(schoolId));
}

/**
 * Creates / updates the school-wide period template.
 * Linked periods follow the new times automatically; slots that are in use cannot be removed.
 */
export async function saveTimetableTemplate(schoolId, payload = {}, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to save timetable template');
  }

  const slots = payload.slots || [];

  // Order + overlap validation (slots must run top to bottom without overlapping)
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!isEndTimeAfterStartTime(s.startTime, s.endTime)) {
      throw new ValidationError(`"${s.label}" must end after it starts`);
    }
    if (i > 0 && timeToMinutes(s.startTime) < timeToMinutes(slots[i - 1].endTime)) {
      throw new ValidationError(`"${s.label}" starts before "${slots[i - 1].label}" ends`);
    }
  }
  if (!slots.some((s) => s.slotType === 'PERIOD')) {
    throw new ValidationError('Add at least one teachable period');
  }

  const existing = await timetableRepository.findTemplate(schoolId);
  const existingSlots = existing?.slots || [];
  const existingById = new Map(existingSlots.map((s) => [s.id, s]));

  for (const s of slots) {
    if (s.id && !existingById.has(s.id)) {
      throw new ValidationError('Unknown template slot in request');
    }
  }

  // Slots that are removed, or turned from a period into a break/lunch, must not be in use
  const keepIds = new Set(slots.filter((s) => s.id).map((s) => s.id));
  const risky = existingSlots.filter((old) => {
    if (!keepIds.has(old.id)) return true;
    const next = slots.find((s) => s.id === old.id);
    return old.slotType === 'PERIOD' && next.slotType !== 'PERIOD';
  });
  if (risky.length > 0) {
    const usage = await timetableRepository.countPeriodsBySlot(schoolId, risky.map((s) => s.id));
    const inUse = risky.filter((s) => usage[s.id] > 0);
    if (inUse.length > 0) {
      const list = inUse.map((s) => `${s.label} (${usage[s.id]} assigned)`).join(', ');
      throw new ConflictError(
        `Cannot remove or convert: ${list}. Clear these periods from the section timetables first.`
      );
    }
  }

  const saved = await timetableRepository.runTransaction((tx) =>
    timetableRepository.saveTemplate(schoolId, { name: payload.name, slots }, tx)
  );

  createAuditLog({
    schoolId,
    entityType: 'TimetableTemplate',
    entityId: saved.id,
    actionPerformed: 'SAVE_TIMETABLE_TEMPLATE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: { slotCount: slots.length }
  }).catch(() => { });

  return formatTemplate(saved);
}