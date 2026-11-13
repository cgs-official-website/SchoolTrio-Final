import { prisma } from '../../database/prisma.client.js';
import { resolveClassTeacherForStudent } from '../classes/teacher-scope.js';

/**
 * Notification fan-out for shared academic resources.
 *
 * Who gets told (same rules as the visibility rules in academic-resource.service.js):
 *  - Class teacher of the section (always)
 *  - Subject teacher(s) of the chosen subject in that section (or every teacher of the section when "General")
 *  - Parents of the students of that class + section (only when audience = teachers_students)
 *
 * One notification per user (de-duplicated across all selected class/sections), never the uploader.
 * Best-effort: callers must not await failures into the request.
 */

/** Notification `type` used for resource alerts (sidebar "Resources" unread badge counts this type) */
export const RESOURCE_NOTIFICATION_TYPE = 'resource';
export const resourceMessagePrefix = title => `New resource shared: "${title}"`;

const asIdArray = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string' && id) : []);

function directoryAssignments(staff) {
    const custom = staff.customData || {};
    const subjectIds = [...asIdArray(custom.assignments?.assignedSubjectIds), ...asIdArray(custom.assignedSubjectIds)];
    const unitIds = asIdArray(custom.assignments?.subjectClassIds);
    const primaryUnit = custom.assignments?.assignedClassId || staff.assignedClassId || null;
    return { subjectIds, unitIds, primaryUnit };
}

/**
 * @param {string} schoolId
 * @param {Array<{ title, classId, sectionId, subjectId, audience, label }>} items one entry per created resource
 * @param {{ uploaderId: string, title: string }} meta
 */
export async function notifyResourceRecipients(schoolId, items, meta) {
    if (!schoolId || !Array.isArray(items) || items.length === 0) return 0;

    const classIds = [...new Set(items.map(i => i.classId))];

    const [periods, staffList] = await Promise.all([
        prisma.timetablePeriod.findMany({
            where: { schoolId, classId: { in: classIds }, teacherId: { not: null } },
            select: { classId: true, sectionId: true, subjectId: true, teacherId: true }
        }),
        prisma.staffProfile.findMany({
            where: { schoolId, status: { not: 'Inactive' } },
            select: { id: true, userId: true, assignedClassId: true, customData: true }
        })
    ]);

    // Class teacher per target: same resolver Messages (chat) uses
    // (Section.classTeacherId -> Staff Directory section assignment -> Class.classTeacherId -> legacy assignedClassId)
    const classTeacherByKey = new Map();
    await Promise.all(
        items.map(async i => {
            const id = await resolveClassTeacherForStudent(schoolId, { classId: i.classId, sectionId: i.sectionId || null });
            classTeacherByKey.set(`${i.classId}:${i.sectionId || ''}`, id);
        })
    );
    const staffById = new Map(staffList.map(s => [s.id, s]));

    // userId -> Set(label)
    const recipients = new Map();
    const add = (userId, label) => {
        if (!userId || userId === meta.uploaderId) return;
        if (!recipients.has(userId)) recipients.set(userId, new Set());
        recipients.get(userId).add(label);
    };
    const addStaff = (staffId, label) => add(staffById.get(staffId)?.userId, label);

    // Parents: one query per class (students of the selected sections of that class)
    const parentItems = items.filter(i => i.audience === 'teachers_students');

    for (const item of items) {
        const { classId, sectionId, subjectId, label } = item;

        // 1. Class teacher
        addStaff(classTeacherByKey.get(`${classId}:${sectionId || ''}`), label);

        // 2. Subject teachers (timetable)
        for (const p of periods) {
            if (p.classId !== classId) continue;
            if (sectionId && p.sectionId !== sectionId) continue;
            if (subjectId && p.subjectId !== subjectId) continue;
            addStaff(p.teacherId, label);
        }

        // 3. Subject teachers (Staff Directory assignments) / section handlers
        const unitId = sectionId || classId;
        for (const staff of staffList) {
            const { subjectIds, unitIds, primaryUnit } = directoryAssignments(staff);
            if (subjectId) {
                const teachesUnit = unitIds.includes(sectionId) || unitIds.includes(classId);
                if (teachesUnit && subjectIds.includes(subjectId)) add(staff.userId, label);
            } else if (unitIds.includes(unitId) || primaryUnit === unitId) {
                add(staff.userId, label); // General: everyone who handles the section
            }
        }
    }

    // 4. Parents of the section's students
    if (parentItems.length > 0) {
        const students = await prisma.student.findMany({
            where: {
                schoolId,
                status: 'Active',
                OR: parentItems.map(i => ({ classId: i.classId, ...(i.sectionId ? { sectionId: i.sectionId } : {}) }))
            },
            select: { id: true, classId: true, sectionId: true }
        });
        if (students.length > 0) {
            const links = await prisma.parentStudentLink.findMany({
                where: { schoolId, studentId: { in: students.map(s => s.id) } },
                select: { studentId: true, parent: { select: { userId: true } } }
            });
            const studentMap = new Map(students.map(s => [s.id, s]));
            for (const link of links) {
                const st = studentMap.get(link.studentId);
                const item = parentItems.find(i => i.classId === st?.classId && (!i.sectionId || i.sectionId === st?.sectionId));
                add(link.parent?.userId, item?.label || '');
            }
        }
    }

    if (recipients.size === 0) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const singleClassId = classIds.length === 1 ? classIds[0] : null;
    const data = [];
    for (const [userId, labelSet] of recipients) {
        const labels = [...labelSet].filter(Boolean);
        const shown = meta.allClasses ? 'All Class' : labels.slice(0, 3).join(', ');
        const extra = !meta.allClasses && labels.length > 3 ? ` +${labels.length - 3} more` : '';
        data.push({
            schoolId,
            userId,
            classId: singleClassId,
            type: RESOURCE_NOTIFICATION_TYPE,
            message: `${resourceMessagePrefix(meta.title)}${shown ? ` for ${shown}${extra}` : ''}`,
            date: today,
            read: false
        });
    }
    await prisma.notification.createMany({ data });
    return data.length;
}
