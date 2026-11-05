import { prisma } from '../database/prisma.client.js';
import { SYSTEM_ROLES } from '../config/constants.js';

export function isTeacherActor(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.TEACHER || role === 'TEACHER';
}

const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

// Stored ids may be class ids or section ids; resolve both to { classId, sectionId }
async function resolveUnits(schoolId, ids) {
  if (!ids.length) return [];
  const [sections, classes] = await Promise.all([
    prisma.section.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, classId: true } }),
    prisma.class.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true } })
  ]);
  return [
    ...classes.map((c) => ({ classId: c.id, sectionId: null })),
    ...sections.map((s) => ({ classId: s.classId, sectionId: s.id }))
  ];
}

/**
 * headedClassIds : classes where she is class teacher (READ-ONLY)
 * teachingUnits  : { classId, sectionId|null, subjectId|null } (ENTRY). subjectId null = any subject.
 */
export async function getTeacherScope(schoolId, userId) {
  const profile = await prisma.staffProfile.findFirst({
    where: { schoolId, userId },
    include: { headedClasses: { select: { id: true } } }
  });
  if (!profile) return null;

  const custom = profile.customData || {};
  const assignments = custom.assignments || {};

  // Class teacher classes
  const headedRaw = [profile.assignedClassId, assignments.assignedClassId].filter((x) => typeof x === 'string' && x);
  const resolvedHeaded = await resolveUnits(schoolId, headedRaw);
  const allHeaded = [
    ...profile.headedClasses.map((c) => ({ classId: c.id, sectionId: null })),
    ...resolvedHeaded
  ];
  const sectionSpecific = new Set(allHeaded.filter((u) => u.sectionId).map((u) => u.classId));
  const headedUnits = allHeaded.filter((u) => u.sectionId || !sectionSpecific.has(u.classId));
  const headedClassIds = new Set(headedUnits.map((u) => u.classId));

  // Teaching units
  const subjectIds = [...new Set([...idList(assignments.assignedSubjectIds), ...idList(custom.assignedSubjectIds)])];
  const rawUnitIds = [...new Set([...idList(assignments.subjectClassIds), ...idList(custom.subjectClassIds)])];
  const teachingUnits = [];

  // Fallback: assigned subjects x assigned classes
  for (const u of await resolveUnits(schoolId, rawUnitIds)) {
    if (subjectIds.length === 0) teachingUnits.push({ ...u, subjectId: null });
    else subjectIds.forEach((subjectId) => teachingUnits.push({ ...u, subjectId }));
  }

  // Precise: timetable class + section + subject for this teacher
  const periods = await prisma.timetablePeriod.findMany({
    where: { schoolId, teacherId: profile.id, subjectId: { not: null } },
    select: { classId: true, sectionId: true, subjectId: true }
  });
  periods.forEach((p) => teachingUnits.push({ classId: p.classId, sectionId: p.sectionId, subjectId: p.subjectId }));

  return { profile, headedClassIds, headedUnits, teachingUnits };
}

export function getAssessmentAccess(scope, { classId, sectionId = null, subjectId = null }) {
  const isClassTeacher = scope.headedUnits.some(
    (u) => u.classId === classId && (!u.sectionId || !sectionId || u.sectionId === sectionId)
  );
  const canEdit = scope.teachingUnits.some(
    (u) =>
      u.classId === classId &&
      (!u.sectionId || !sectionId || u.sectionId === sectionId) &&
      (!subjectId || !u.subjectId || u.subjectId === subjectId)
  );
  return { isClassTeacher, canEdit, canView: isClassTeacher || canEdit };
}

// Prisma OR-filter limiting assessments to what the teacher may see
export function buildScopeFilter(scope) {
  const or = [];
  for (const h of scope.headedUnits) {
    or.push({
      classId: h.classId,
      ...(h.sectionId ? { AND: [{ OR: [{ sectionId: null }, { sectionId: h.sectionId }] }] } : {})
    });
  }
  for (const u of scope.teachingUnits) {
    const and = [];
    if (u.sectionId) and.push({ OR: [{ sectionId: null }, { sectionId: u.sectionId }] });
    if (u.subjectId) and.push({ OR: [{ subjectId: null }, { subjectId: u.subjectId }] });
    or.push({ classId: u.classId, ...(and.length ? { AND: and } : {}) });
  }
  return or.length ? or : null;
}

export function summarizeClasses(scope) {
  const map = new Map();
  const get = (id) => {
    if (!map.has(id)) map.set(id, { id, isClassTeacher: false, anySubject: false, subjectIds: new Set() });
    return map.get(id);
  };
  scope.headedClassIds.forEach((id) => { get(id).isClassTeacher = true; });
  for (const u of scope.teachingUnits) {
    const c = get(u.classId);
    if (!u.subjectId) c.anySubject = true;
    else c.subjectIds.add(u.subjectId);
  }
  return [...map.values()].map((c) => ({
    id: c.id,
    isClassTeacher: c.isClassTeacher,
    canEnterMarks: c.anySubject || c.subjectIds.size > 0,
    teachingSubjectIds: c.anySubject ? null : [...c.subjectIds] // null = any subject
  }));
}