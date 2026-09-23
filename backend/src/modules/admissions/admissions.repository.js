import { prisma } from '../../database/prisma.client.js';

/**
 * Admissions & Lead Management Repository
 *
 * Strict Architectural Invariants:
 * 1. All tenant-scoped operations MUST filter by `schoolId`.
 * 2. Never query `findUnique({ where: { id } })` without scoping to `schoolId`.
 * 3. Support optional transaction client `tx` for atomic database operations.
 */

// =========================================================================
// 1. ADMISSION LEADS (CRM / Inquiries)
// =========================================================================

/**
 * Finds leads for a tenant with filtering, search, and pagination.
 */
export async function findLeads(schoolId, options = {}, tx = prisma) {
  const where = buildLeadsWhereClause(schoolId, options);

  const orderBy = {};
  const sortField = options.sort || 'submittedAt';
  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';
  orderBy[sortField] = sortOrder;

  return await tx.admissionLead.findMany({
    where,
    orderBy,
    skip: options.skip,
    take: options.take
  });
}

/**
 * Counts total leads matching criteria.
 */
export async function countLeads(schoolId, options = {}, tx = prisma) {
  const where = buildLeadsWhereClause(schoolId, options);
  return await tx.admissionLead.count({ where });
}

/**
 * Finds a single lead by ID within a tenant.
 */
export async function findLeadById(schoolId, id, tx = prisma) {
  return await tx.admissionLead.findFirst({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Creates a new lead.
 */
export async function createLead(leadData, tx = prisma) {
  return await tx.admissionLead.create({
    data: leadData
  });
}

/**
 * Updates a lead's status.
 */
export async function updateLeadStatus(schoolId, id, status, tx = prisma) {
  return await tx.admissionLead.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      status
    }
  });
}

/**
 * Deletes a lead.
 */
export async function deleteLead(schoolId, id, tx = prisma) {
  return await tx.admissionLead.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Builds where clause for leads queries.
 */
function buildLeadsWhereClause(schoolId, options) {
  const where = { schoolId };

  if (options.status && options.status !== 'all') {
    where.status = { equals: options.status, mode: 'insensitive' };
  }

  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      { gradeInterested: { contains: term, mode: 'insensitive' } },
      { status: { contains: term, mode: 'insensitive' } }
    ];
  }

  if (options.startDate || options.endDate) {
    where.submittedAt = {};
    if (options.startDate) {
      where.submittedAt.gte = new Date(`${options.startDate}T00:00:00.000Z`);
    }
    if (options.endDate) {
      where.submittedAt.lte = new Date(`${options.endDate}T23:59:59.999Z`);
    }
  }

  return where;
}

// =========================================================================
// 2. LEAD FORMS (Dynamic Form Builder)
// =========================================================================

/**
 * Finds lead forms for a tenant.
 */
export async function findLeadForms(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.isActive !== undefined) {
    where.isActive = options.isActive;
  }

  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } }
    ];
  }

  const orderBy = {};
  const sortField = options.sort || 'createdAt';
  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';
  orderBy[sortField] = sortOrder;

  return await tx.leadForm.findMany({
    where,
    orderBy,
    skip: options.skip,
    take: options.take
  });
}

/**
 * Counts total lead forms.
 */
export async function countLeadForms(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };
  if (options.isActive !== undefined) {
    where.isActive = options.isActive;
  }
  return await tx.leadForm.count({ where });
}

/**
 * Finds a single lead form by ID within a tenant.
 */
export async function findLeadFormById(schoolId, id, tx = prisma) {
  return await tx.leadForm.findFirst({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Creates a new lead form.
 */
export async function createLeadForm(formData, tx = prisma) {
  return await tx.leadForm.create({
    data: formData
  });
}

/**
 * Updates an existing lead form.
 */
export async function updateLeadForm(schoolId, id, formData, tx = prisma) {
  return await tx.leadForm.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: formData
  });
}

/**
 * Deletes a lead form.
 */
export async function deleteLeadForm(schoolId, id, tx = prisma) {
  return await tx.leadForm.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

// =========================================================================
// 3. ADMISSION APPLICATIONS
// =========================================================================

/**
 * Finds admission applications for a tenant with filtering, search, and pagination.
 */
export async function findApplications(schoolId, options = {}, tx = prisma) {
  const where = buildApplicationsWhereClause(schoolId, options);

  const orderBy = {};
  const sortField = options.sort || 'submittedAt';
  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';
  orderBy[sortField] = sortOrder;

  return await tx.admissionApplication.findMany({
    where,
    include: {
      class: {
        select: {
          id: true,
          name: true,
          gradeLevel: true
        }
      }
    },
    orderBy,
    skip: options.skip,
    take: options.take
  });
}

/**
 * Counts total admission applications matching criteria.
 */
export async function countApplications(schoolId, options = {}, tx = prisma) {
  const where = buildApplicationsWhereClause(schoolId, options);
  return await tx.admissionApplication.count({ where });
}

/**
 * Finds a single admission application by ID within a tenant.
 */
export async function findApplicationById(schoolId, id, tx = prisma) {
  return await tx.admissionApplication.findFirst({
    where: {
      id,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          gradeLevel: true,
          sections: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });
}

/**
 * Creates an admission application.
 */
export async function createApplication(appData, tx = prisma) {
  return await tx.admissionApplication.create({
    data: appData
  });
}

/**
 * Updates an admission application's status.
 */
export async function updateApplicationStatus(schoolId, id, status, tx = prisma) {
  return await tx.admissionApplication.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      status
    }
  });
}

/**
 * Deletes an admission application.
 */
export async function deleteApplication(schoolId, id, tx = prisma) {
  return await tx.admissionApplication.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Builds where clause for applications queries.
 */
function buildApplicationsWhereClause(schoolId, options) {
  const where = { schoolId };

  if (options.status && options.status !== 'all') {
    where.status = { equals: options.status, mode: 'insensitive' };
  }

  if (options.classId && options.classId !== 'all') {
    where.classId = options.classId;
  }

  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { studentName: { contains: term, mode: 'insensitive' } },
      { parentName: { contains: term, mode: 'insensitive' } },
      { parentEmail: { contains: term, mode: 'insensitive' } },
      { parentPhone: { contains: term, mode: 'insensitive' } },
      { address: { contains: term, mode: 'insensitive' } }
    ];
  }

  if (options.startDate || options.endDate) {
    where.submittedAt = {};
    if (options.startDate) {
      where.submittedAt.gte = new Date(`${options.startDate}T00:00:00.000Z`);
    }
    if (options.endDate) {
      where.submittedAt.lte = new Date(`${options.endDate}T23:59:59.999Z`);
    }
  }

  return where;
}

// =========================================================================
// 4. PUBLIC PORTAL & LOOKUPS
// =========================================================================

/**
 * Finds public metadata for an approved school (name, logo, active classes).
 */
export async function findSchoolPublicMeta(schoolId, tx = prisma) {
  return await tx.school.findFirst({
    where: {
      id: schoolId,
      status: 'approved'
    },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      logoUrl: true,
      address: true,
      email: true,
      phone: true,
      seatLimit: true,
      classes: {
        select: {
          id: true,
          name: true,
          gradeLevel: true,
          sections: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      }
    }
  });
}

/**
 * Finds an active public lead form for a school.
 */
export async function findPublicLeadForm(schoolId, formId, tx = prisma) {
  return await tx.leadForm.findFirst({
    where: {
      id: formId,
      schoolId,
      isActive: true,
      school: {
        status: 'approved'
      }
    },
    select: {
      id: true,
      schoolId: true,
      title: true,
      description: true,
      fields: true,
      school: {
        select: {
          id: true,
          name: true,
          logoUrl: true
        }
      }
    }
  });
}
