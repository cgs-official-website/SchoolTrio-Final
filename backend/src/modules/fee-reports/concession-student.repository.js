import { prisma } from '../../database/prisma.client.js';
import { buildWhere } from './concession-report.repository.js';

const STUDENT_SELECT = {
  id: true,
  admissionNumber: true,
  firstName: true,
  lastName: true,
  customData: true,
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  parents: { select: { relationship: true, parent: { select: { name: true } } } }
};

const SORTERS = {
  admissionNumber: (d) => [{ admissionNumber: d }],
  studentName: (d) => [{ firstName: d }, { lastName: d }],
  className: (d) => [{ class: { name: d } }],
  sectionName: (d) => [{ section: { name: d } }]
};

/** One group per student that has a matching active concession, with the concession total. */
export async function findConcessionGroups(schoolId, range, options = {}, tx = prisma) {
  return tx.feeConcession.groupBy({
    by: ['studentId'],
    where: buildWhere(schoolId, range, options),
    _sum: { amount: true }
  });
}

/** One page of those students, sorted and paged in the database. */
export async function findStudentsPage(schoolId, ids, options = {}, tx = prisma) {
  if (ids.length === 0) return [];

  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const direction = options.order === 'desc' ? 'desc' : 'asc';
  const sorter = SORTERS[options.sortBy] || SORTERS.admissionNumber;

  return tx.student.findMany({
    where: { schoolId, id: { in: ids } },
    orderBy: [...sorter(direction), { id: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
    select: STUDENT_SELECT
  });
}

/** The matching concessions of the students on one page (category names, and amounts per fee category). */
export async function findConcessionsForStudents(schoolId, studentIds, range, options = {}, tx = prisma) {
  return tx.feeConcession.findMany({
    where: { AND: [buildWhere(schoolId, range, options), { studentId: { in: studentIds } }] },
    select: {
      studentId: true,
      amount: true,
      concessionCategory: { select: { name: true } },
      invoice: {
        select: {
          feeName: true,
          feeStructure: {
            select: {
              feeCategoryId: true,
              feeCategory: { select: { name: true } }
            }
          }
        }
      }
    }
  });
}

/** Every fee (not deleted) of the students on one page, for the consolidated columns. */
export async function findInvoicesForStudents(schoolId, studentIds, tx = prisma) {
  return tx.invoice.findMany({
    where: { schoolId, studentId: { in: studentIds }, status: { not: 'Cancelled' } },
    select: {
      studentId: true,
      amount: true,
      feeStructure: { select: { feeCategoryId: true } }
    }
  });
}