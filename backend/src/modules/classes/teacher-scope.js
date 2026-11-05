import { prisma } from '../../database/prisma.client.js';
import { getTeacherAssignments } from './class.service.js';

/**
 * Teacher scope helper (single source of truth for "what does this teacher handle?").
 *
 * - Class teacher of a section  -> Section.classTeacherId
 * - Teaches a section / class   -> timetable periods + Staff Directory assignments
 * - Teaches a subject           -> Staff Directory assignedSubjectIds + timetable periods
 *
 * Used by Messages (chat), Lesson Plans and Attendance so every teacher page agrees on
 * the same class / section / subject scope.
 */

/**
 * @param {string} schoolId
 * @param {string} userId
 * @returns {Promise<{
 *   staffProfile: Object|null,
 *   classTeacherSectionIds: Set<string>,
 *   classTeacherClassIds: Set<string>,
 *   sectionIds: Set<string>,
 *   wholeClassIds: Set<string>,
 *   classIds: Set<string>,
 *   subjectIds: Set<string>
 * }>}
 */
export async function getTeacherScope(schoolId, userId) {
    const assignments = await getTeacherAssignments(schoolId, userId);
    const { staffProfile, wholeClassIds, sectionIds, classTeacherSectionIds } = assignments;

    const empty = {
        staffProfile: staffProfile || null,
        classTeacherSectionIds: new Set(classTeacherSectionIds || []),
        classTeacherClassIds: new Set(),
        sectionIds: new Set(sectionIds || []),
        wholeClassIds: new Set(wholeClassIds || []),
        classIds: new Set(wholeClassIds || []),
        subjectIds: new Set()
    };
    if (!staffProfile) return empty;

    // Resolve parent class of every section in scope
    if (empty.sectionIds.size > 0) {
        const sections = await prisma.section.findMany({
            where: { schoolId, id: { in: Array.from(empty.sectionIds) } },
            select: { id: true, classId: true }
        });
        const classOfSection = new Map(sections.map((s) => [s.id, s.classId]));
        for (const s of sections) empty.classIds.add(s.classId);
        for (const id of empty.classTeacherSectionIds) {
            const classId = classOfSection.get(id);
            if (classId) empty.classTeacherClassIds.add(classId);
        }
    }

    // Subjects: Staff Directory + timetable
    const custom = staffProfile.customData || {};
    const fromProfile = [
        ...(Array.isArray(custom.assignments?.assignedSubjectIds) ? custom.assignments.assignedSubjectIds : []),
        ...(Array.isArray(custom.assignedSubjectIds) ? custom.assignedSubjectIds : [])
    ];
    for (const id of fromProfile) if (id) empty.subjectIds.add(id);

    const periods = await prisma.timetablePeriod.findMany({
        where: { schoolId, teacherId: staffProfile.id, subjectId: { not: null } },
        select: { subjectId: true },
        distinct: ['subjectId']
    });
    for (const p of periods) if (p.subjectId) empty.subjectIds.add(p.subjectId);

    return empty;
}

/**
 * Is the student inside the teacher's class/section scope?
 */
export function isStudentInScope(scope, student) {
    if (!scope || !student) return false;
    if (student.sectionId && scope.sectionIds.has(student.sectionId)) return true;
    if (student.classId && scope.wholeClassIds.has(student.classId)) return true;
    return false;
}

/**
 * Finds the class teacher (StaffProfile id) responsible for a student.
 * Priority: Section.classTeacherId -> Staff Directory section assignment -> Class.classTeacherId
 *           -> legacy StaffProfile.assignedClassId (only for classes without sections).
 */
export async function resolveClassTeacherForStudent(schoolId, student, tx = prisma) {
    if (!student) return null;

    const activeOnly = { status: { not: 'Inactive' } };

    if (student.sectionId) {
        const section = await tx.section.findFirst({
            where: { id: student.sectionId, schoolId },
            select: { classTeacherId: true }
        });
        if (section?.classTeacherId) return section.classTeacherId;

        const bySectionAssignment = await tx.staffProfile.findFirst({
            where: {
                schoolId,
                ...activeOnly,
                customData: { path: ['assignments', 'assignedClassId'], equals: student.sectionId }
            },
            select: { id: true }
        });
        if (bySectionAssignment) return bySectionAssignment.id;
    }

    if (student.classId) {
        const cls = await tx.class.findFirst({
            where: { id: student.classId, schoolId },
            select: { classTeacherId: true, _count: { select: { sections: true } } }
        });
        if (cls?.classTeacherId && !(student.sectionId && cls._count.sections > 0)) {
            return cls.classTeacherId;
        }
        if (!student.sectionId || !cls?._count?.sections) {
            const legacy = await tx.staffProfile.findFirst({
                where: { schoolId, ...activeOnly, assignedClassId: student.classId },
                select: { id: true }
            });
            if (legacy) return legacy.id;
        }
        if (cls?.classTeacherId) return cls.classTeacherId;
    }

    return null;
}
