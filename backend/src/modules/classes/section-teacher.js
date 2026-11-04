/**
 * Per-section class teacher assignment.
 *
 * Source of truth: Section.classTeacherId  (one class teacher per SECTION).
 *
 * Legacy fields that other modules (attendance, homework, chats, notices...) still read
 * are kept consistent with it:
 *   - StaffProfile.assignedClassId  -> the parent CLASS id of the section the teacher heads.
 *       Several teachers may share the same assignedClassId (V-A teacher and V-B teacher both
 *       have class V) so they must NEVER be cleared just because a sibling section got a teacher.
 *   - StaffProfile.customData.assignments.assignedClassId -> the SECTION id (what the Staff
 *       Directory shows as "V - SECTION A (CLASS)").
 *   - Class.classTeacherId -> a "head" teacher of the class = teacher of the first section that
 *       has one. Only kept so old filters like "classes with a teacher" keep working.
 *
 * All functions take a Prisma transaction client (`tx`) so callers stay atomic.
 */

async function readAssignments(tx, schoolId, staffId) {
    const staff = await tx.staffProfile.findFirst({
        where: { id: staffId, schoolId },
        select: { id: true, assignedClassId: true, customData: true }
    });
    return staff;
}

async function writeStaffAssignment(tx, schoolId, staffId, { assignedClassId, sectionId }) {
    const staff = await readAssignments(tx, schoolId, staffId);
    if (!staff) return;

    const customData = { ...(staff.customData || {}) };
    customData.assignments = {
        ...(customData.assignments || {}),
        assignedClassId: sectionId
    };

    await tx.staffProfile.update({
        where: { schoolId_id: { schoolId, id: staffId } },
        data: { assignedClassId, customData }
    });
}

/**
 * Keeps Class.classTeacherId equal to the teacher of the first (alphabetical) section that has one.
 * Classes without sections are left untouched (they keep the plain class-level assignment).
 */
export async function syncClassHeadTeacher(tx, schoolId, classId) {
    const sections = await tx.section.findMany({
        where: { schoolId, classId },
        select: { id: true, name: true, classTeacherId: true },
        orderBy: { name: 'asc' }
    });
    if (sections.length === 0) return;

    const head = sections.find((s) => s.classTeacherId)?.classTeacherId || null;
    await tx.class.update({
        where: { schoolId_id: { schoolId, id: classId } },
        data: { classTeacherId: head }
    });
}

/**
 * Assigns (or clears, when staffId is null) the class teacher of ONE section.
 * Only that section's previous teacher is affected - sibling sections keep their teachers.
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} schoolId
 * @param {string} sectionId
 * @param {string|null} staffId
 * @returns {Promise<{ classId: string, previousTeacherId: string|null }>}
 */
export async function setSectionClassTeacher(tx, schoolId, sectionId, staffId) {
    const section = await tx.section.findFirst({
        where: { id: sectionId, schoolId },
        select: { id: true, classId: true, classTeacherId: true }
    });
    if (!section) {
        throw new Error('Section not found in the current school');
    }

    const previousTeacherId = section.classTeacherId || null;

    // 1. Unassign the section's previous teacher (only if it is someone else, or we are clearing).
    if (previousTeacherId && previousTeacherId !== staffId) {
        await writeStaffAssignment(tx, schoolId, previousTeacherId, {
            assignedClassId: null,
            sectionId: null
        });
    }

    if (!staffId) {
        await tx.section.update({ where: { id: sectionId }, data: { classTeacherId: null } });
        await syncClassHeadTeacher(tx, schoolId, section.classId);
        return { classId: section.classId, previousTeacherId };
    }

    // 2. A teacher is class teacher of exactly one unit: release any other section they head.
    const otherSections = await tx.section.findMany({
        where: { schoolId, classTeacherId: staffId, NOT: { id: sectionId } },
        select: { id: true, classId: true }
    });
    for (const other of otherSections) {
        await tx.section.update({ where: { id: other.id }, data: { classTeacherId: null } });
        if (other.classId !== section.classId) {
            await syncClassHeadTeacher(tx, schoolId, other.classId);
        }
    }

    // ...and release a plain class-level assignment on a class that has no sections / another class.
    await tx.class.updateMany({
        where: { schoolId, classTeacherId: staffId, NOT: { id: section.classId } },
        data: { classTeacherId: null }
    });

    // 3. Assign.
    await tx.section.update({ where: { id: sectionId }, data: { classTeacherId: staffId } });
    await writeStaffAssignment(tx, schoolId, staffId, {
        assignedClassId: section.classId,
        sectionId
    });
    await syncClassHeadTeacher(tx, schoolId, section.classId);

    return { classId: section.classId, previousTeacherId };
}

/**
 * Clears every section a staff member heads (used on unassign / deactivation).
 * Returns the ids of the sections that were cleared.
 */
export async function clearStaffSectionAssignments(tx, schoolId, staffId) {
    const headed = (await tx.section.findMany({
        where: { schoolId, classTeacherId: staffId },
        select: { id: true, classId: true }
    })) || [];

    for (const sec of headed) {
        await tx.section.update({ where: { id: sec.id }, data: { classTeacherId: null } });
        await syncClassHeadTeacher(tx, schoolId, sec.classId);
    }
    if (headed.length > 0) {
        await writeStaffAssignment(tx, schoolId, staffId, { assignedClassId: null, sectionId: null });
    }
    return headed.map((s) => s.id);
}
