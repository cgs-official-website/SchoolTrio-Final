import { prisma } from '../../database/prisma.client.js';

/**
 * Counts the pending complaints for a school tenant.
 * Matches legacy status ('pending' or 'Pending').
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<number>} Count of pending complaints
 */
export const countPendingComplaints = async (schoolId, tx = prisma) => {
  return tx.complaint.count({
    where: {
      schoolId,
      status: {
        in: ['pending', 'Pending']
      }
    }
  });
};

/**
 * Lists complaints for a school tenant with optional status and submitter filtering.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} options - Filter & pagination options
 * @param {string} [options.status] - Optional status filter ('pending', 'resolved', 'rejected')
 * @param {string} [options.submittedByUserId] - Optional submitter user UUID filter
 * @param {number} [options.skip=0] - Offset for pagination
 * @param {number} [options.take=20] - Limit for pagination
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<{ data: Array<Object>, total: number }>}
 */
export const listComplaints = async (schoolId, { status, submittedByUserId, skip = 0, take = 20 } = {}, tx = prisma) => {
  const where = {
    schoolId,
    ...(status && { status }),
    ...(submittedByUserId && { submittedByUserId })
  };

  const [data, total] = await Promise.all([
    tx.complaint.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: 'desc'
      }
    }),
    tx.complaint.count({ where })
  ]);

  return { data, total };
};

/**
 * Finds a single complaint by ID within a school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Complaint UUID
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<Object|null>}
 */
export const findComplaintById = async (schoolId, id, tx = prisma) => {
  return tx.complaint.findFirst({
    where: {
      id,
      schoolId
    }
  });
};

/**
 * Finds a single complaint by ID with a PostgreSQL row-level lock (FOR UPDATE).
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Complaint UUID
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export const findComplaintByIdForUpdate = async (schoolId, id, tx) => {
  const rows = await tx.$queryRaw`
    SELECT
      id,
      school_id AS "schoolId",
      title,
      description,
      status,
      submitted_by_user_id AS "submittedByUserId",
      assigned_to_user_id AS "assignedToUserId",
      resolution_notes AS "resolutionNotes",
      resolved_at AS "resolvedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM complaints
    WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid
    FOR UPDATE;
  `;
  return rows[0] || null;
};

/**
 * Creates a new complaint in PostgreSQL.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} data - Complaint payload
 * @param {string} data.title - Complaint title
 * @param {string} data.description - Complaint description
 * @param {string} data.submittedByUserId - Submitter User UUID
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<Object>}
 */
export const createComplaint = async (schoolId, { title, description, submittedByUserId }, tx = prisma) => {
  return tx.complaint.create({
    data: {
      schoolId,
      title,
      description,
      submittedByUserId,
      status: 'pending'
    }
  });
};

/**
 * Updates status and resolution details of a complaint.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Complaint UUID
 * @param {Object} data - Update payload
 * @param {string} data.status - New status ('resolved' or 'rejected')
 * @param {string|null} [data.resolutionNotes] - Resolution notes
 * @param {Date} data.resolvedAt - Resolution timestamp
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<Object>}
 */
export const updateComplaintStatus = async (schoolId, id, { status, resolutionNotes, resolvedAt }, tx = prisma) => {
  return tx.complaint.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      status,
      resolutionNotes: resolutionNotes || null,
      resolvedAt
    }
  });
};

export const complaintRepository = {
  countPendingComplaints,
  listComplaints,
  findComplaintById,
  findComplaintByIdForUpdate,
  createComplaint,
  updateComplaintStatus
};

export default complaintRepository;
