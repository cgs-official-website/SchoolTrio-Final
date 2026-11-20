import { prisma } from '../../database/prisma.client.js';

/**
 * Fee Entry student matching and invoice generation.
 *
 * Single source of truth for "which students does this fee apply to" and
 * "create the missing invoices". Used by:
 *   - creating a fee entry (fee-entry.service.js)
 *   - the Sync button and new-student auto-fees (fee.service.js)
 *
 * Rules:
 *   - Only Active students are billed.
 *   - A student never gets two invoices from the same fee structure, even if the
 *     earlier one was cancelled (a deleted fee must not come back on Sync).
 *   - A student is skipped when another non-cancelled invoice already exists for the
 *     same fee category and due date.
 */

export const ACTIVE_STATUSES = ['Active', 'active', 'ACTIVE'];
export const TARGET_TYPES = ['ALL_STUDENT', 'CLASS', 'SECTION', 'STUDENT'];

const ID_CHUNK = 5000;
const INSERT_CHUNK = 1000;

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const sameGender = (filter, studentGender) =>
  !filter || (studentGender || '').trim().toLowerCase() === String(filter).trim().toLowerCase();

/**
 * Target ids for a structure. Structures created before Fee Entries have no
 * targetIds and are a plain "one class" fee, so they fall back to classId.
 */
export function resolveTargetIds(structure) {
  if (Array.isArray(structure.targetIds) && structure.targetIds.length > 0) return structure.targetIds;
  if ((structure.targetType || 'CLASS') === 'CLASS' && structure.classId) return [structure.classId];
  return [];
}

/**
 * Active students a structure applies to (gender filter included).
 *
 * @returns {Promise<Array<{ id: string }>>}
 */
export async function findMatchingStudents(schoolId, structure, tx = prisma) {
  const type = structure.targetType || 'CLASS';
  const ids = resolveTargetIds(structure);

  const where = { schoolId, status: { in: ACTIVE_STATUSES } };

  if (type === 'CLASS') {
    if (ids.length === 0) return [];
    where.classId = { in: ids };
  } else if (type === 'SECTION') {
    if (ids.length === 0) return [];
    where.sectionId = { in: ids };
  } else if (type === 'STUDENT') {
    if (ids.length === 0) return [];
    where.id = { in: ids };
  }
  // ALL_STUDENT: every active student in the school

  if (structure.gender) {
    where.gender = { equals: structure.gender, mode: 'insensitive' };
  }

  return tx.student.findMany({
    where,
    select: { id: true },
    orderBy: { id: 'asc' }
  });
}

/**
 * Creates the missing invoices for one fee structure.
 *
 * @returns {Promise<{ matched: number, generated: number, skipped: number }>}
 */
export async function generateInvoicesForStructure(schoolId, structure, tx = prisma) {
  const students = await findMatchingStudents(schoolId, structure, tx);
  const matched = students.length;
  if (matched === 0) return { matched: 0, generated: 0, skipped: 0 };

  const blocked = new Set();

  for (const ids of chunk(students.map((s) => s.id), ID_CHUNK)) {
    // 1. Already billed by this very structure (any status, so deleted fees stay deleted)
    const sameStructure = await tx.invoice.findMany({
      where: { schoolId, feeStructureId: structure.id, studentId: { in: ids } },
      select: { studentId: true }
    });
    sameStructure.forEach((r) => blocked.add(r.studentId));

    // 2. Same fee category + due date already billed by another structure
    if (structure.feeCategoryId) {
      const sameFee = await tx.invoice.findMany({
        where: {
          schoolId,
          studentId: { in: ids },
          status: { not: 'Cancelled' },
          feeStructureId: { not: structure.id },
          dueDate: structure.dueDate,
          feeStructure: { feeCategoryId: structure.feeCategoryId }
        },
        select: { studentId: true }
      });
      sameFee.forEach((r) => blocked.add(r.studentId));
    }
  }

  const eligible = students.filter((s) => !blocked.has(s.id));
  if (eligible.length === 0) return { matched, generated: 0, skipped: matched };

  let generated = 0;
  for (const part of chunk(eligible, INSERT_CHUNK)) {
    const result = await tx.invoice.createMany({
      data: part.map((student) => ({
        schoolId,
        studentId: student.id,
        feeStructureId: structure.id,
        collectionPeriodId: structure.collectionPeriodId || null,
        feeName: structure.name,
        amount: structure.amount,
        dueDate: structure.dueDate,
        status: 'Pending',
        customData: structure.customData ?? null
      }))
    });
    generated += result.count;
  }

  return { matched, generated, skipped: matched - generated };
}

/**
 * Gives one student every fee that applies to them and they do not have yet.
 * Called when a student is added, admitted, or moves class / section.
 *
 * @returns {Promise<number>} Number of invoices created
 */
export async function syncStudentFeeInvoices(schoolId, studentId, tx = prisma) {
  if (!schoolId || !studentId) return 0;

  const student = await tx.student.findFirst({
    where: { schoolId, id: studentId },
    select: { id: true, classId: true, sectionId: true, gender: true, status: true }
  });
  if (!student || !ACTIVE_STATUSES.includes(student.status)) return 0;

  const applies = [{ targetType: 'ALL_STUDENT' }, { targetType: 'STUDENT', targetIds: { has: student.id } }];
  if (student.classId) {
    applies.push({ targetType: 'CLASS', targetIds: { has: student.classId } });
    // Structures created before Fee Entries: plain one-class fee with no targetIds
    applies.push({ targetType: 'CLASS', targetIds: { isEmpty: true }, classId: student.classId });
  }
  if (student.sectionId) {
    applies.push({ targetType: 'SECTION', targetIds: { has: student.sectionId } });
  }

  const structures = await tx.feeStructure.findMany({ where: { schoolId, OR: applies } });
  let created = 0;

  for (const fs of structures) {
    if (!sameGender(fs.gender, student.gender)) continue;

    const own = await tx.invoice.findFirst({
      where: { schoolId, studentId: student.id, feeStructureId: fs.id },
      select: { id: true }
    });
    if (own) continue;

    if (fs.feeCategoryId) {
      const duplicate = await tx.invoice.findFirst({
        where: {
          schoolId,
          studentId: student.id,
          status: { not: 'Cancelled' },
          dueDate: fs.dueDate,
          feeStructure: { feeCategoryId: fs.feeCategoryId }
        },
        select: { id: true }
      });
      if (duplicate) continue;
    }

    await tx.invoice.create({
      data: {
        schoolId,
        studentId: student.id,
        feeStructureId: fs.id,
        collectionPeriodId: fs.collectionPeriodId || null,
        feeName: fs.name,
        amount: fs.amount,
        dueDate: fs.dueDate,
        status: 'Pending',
        customData: fs.customData ?? null
      }
    });
    created++;
  }

  return created;
}