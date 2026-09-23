import { prisma } from '../../database/prisma.client.js';

/**
 * Executes a callback within a Prisma transaction.
 *
 * @param {Function} fn - Transaction callback (tx => Promise<any>)
 * @param {Object} [options] - Optional transaction options
 * @returns {Promise<any>}
 */
export async function runTransaction(fn, options = {}) {
  return prisma.$transaction(async (tx) => {
    return fn(tx);
  }, {
    maxWait: options.maxWait || 10000,
    timeout: options.timeout || 15000,
    ...options
  });
}

// ============================================================
// VEHICLE REPOSITORY OPERATIONS
// ============================================================

export async function findVehicles(schoolId, filters = {}, tx = prisma) {
  const where = { schoolId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { registrationNumber: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } }
    ];
  }

  return tx.transportVehicle.findMany({
    where,
    include: {
      routes: {
        select: {
          id: true,
          name: true,
          routeNumber: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function findVehicleById(schoolId, id, tx = prisma) {
  return tx.transportVehicle.findFirst({
    where: { schoolId, id },
    include: {
      routes: {
        select: {
          id: true,
          name: true,
          routeNumber: true
        }
      }
    }
  });
}

export async function findVehicleByRegistrationNumber(schoolId, registrationNumber, excludeId = null, tx = prisma) {
  const where = {
    schoolId,
    registrationNumber: { equals: registrationNumber, mode: 'insensitive' }
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  return tx.transportVehicle.findFirst({ where });
}

export async function createVehicle(schoolId, data, tx = prisma) {
  return tx.transportVehicle.create({
    data: {
      schoolId,
      registrationNumber: data.registrationNumber,
      model: data.model || null,
      capacity: data.capacity,
      insuranceExpiry: data.insuranceExpiry || null,
      pollutionExpiry: data.pollutionExpiry || null,
      fitnessExpiry: data.fitnessExpiry || null,
      status: data.status || 'Active',
      customData: data.customData || null
    },
    include: {
      routes: {
        select: { id: true, name: true, routeNumber: true }
      }
    }
  });
}

export async function updateVehicle(schoolId, id, data, tx = prisma) {
  const updateData = {};
  if (data.registrationNumber !== undefined) updateData.registrationNumber = data.registrationNumber;
  if (data.model !== undefined) updateData.model = data.model;
  if (data.capacity !== undefined) updateData.capacity = data.capacity;
  if (data.insuranceExpiry !== undefined) updateData.insuranceExpiry = data.insuranceExpiry;
  if (data.pollutionExpiry !== undefined) updateData.pollutionExpiry = data.pollutionExpiry;
  if (data.fitnessExpiry !== undefined) updateData.fitnessExpiry = data.fitnessExpiry;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.customData !== undefined) updateData.customData = data.customData;

  return tx.transportVehicle.update({
    where: { schoolId_id: { schoolId, id } },
    data: updateData,
    include: {
      routes: {
        select: { id: true, name: true, routeNumber: true }
      }
    }
  });
}

export async function deleteVehicle(schoolId, id, tx = prisma) {
  return tx.transportVehicle.delete({
    where: { schoolId_id: { schoolId, id } }
  });
}

// ============================================================
// ROUTE REPOSITORY OPERATIONS
// ============================================================

export async function findRoutes(schoolId, filters = {}, tx = prisma) {
  const where = { schoolId };

  if (filters.vehicleId) {
    where.vehicleId = filters.vehicleId;
  }

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { routeNumber: { contains: q, mode: 'insensitive' } },
      { driverName: { contains: q, mode: 'insensitive' } }
    ];
  }

  return tx.transportRoute.findMany({
    where,
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          model: true,
          capacity: true,
          status: true
        }
      },
      stops: {
        orderBy: { stopOrder: 'asc' }
      },
      _count: {
        select: { students: true }
      }
    },
    orderBy: { name: 'asc' }
  });
}

export async function findRouteById(schoolId, id, tx = prisma) {
  return tx.transportRoute.findFirst({
    where: { schoolId, id },
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          model: true,
          capacity: true,
          status: true
        }
      },
      stops: {
        orderBy: { stopOrder: 'asc' }
      },
      students: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          sectionId: true,
          pickupStopId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          pickupStop: { select: { id: true, stopName: true, pickupTime: true } }
        },
        orderBy: { firstName: 'asc' }
      },
      _count: {
        select: { students: true }
      }
    }
  });
}

/**
 * Retrieves route with row-level lock FOR UPDATE inside transaction to serialize capacity checks.
 */
export async function lockRouteForUpdate(schoolId, routeId, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", capacity, name
    FROM transport_routes
    WHERE school_id = ${schoolId}::uuid AND id = ${routeId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

export async function createRoute(schoolId, data, tx = prisma) {
  return tx.transportRoute.create({
    data: {
      schoolId,
      name: data.name,
      routeNumber: data.routeNumber || null,
      vehicleId: data.vehicleId || null,
      driverName: data.driverName || null,
      driverPhone: data.driverPhone || null,
      capacity: data.capacity || 30
    },
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          model: true,
          capacity: true,
          status: true
        }
      },
      stops: true,
      _count: {
        select: { students: true }
      }
    }
  });
}

export async function updateRoute(schoolId, id, data, tx = prisma) {
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.routeNumber !== undefined) updateData.routeNumber = data.routeNumber;
  if (data.vehicleId !== undefined) updateData.vehicleId = data.vehicleId;
  if (data.driverName !== undefined) updateData.driverName = data.driverName;
  if (data.driverPhone !== undefined) updateData.driverPhone = data.driverPhone;
  if (data.capacity !== undefined) updateData.capacity = data.capacity;

  return tx.transportRoute.update({
    where: { schoolId_id: { schoolId, id } },
    data: updateData,
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          model: true,
          capacity: true,
          status: true
        }
      },
      stops: {
        orderBy: { stopOrder: 'asc' }
      },
      _count: {
        select: { students: true }
      }
    }
  });
}

export async function deleteRoute(schoolId, id, tx = prisma) {
  return tx.transportRoute.delete({
    where: { schoolId_id: { schoolId, id } }
  });
}

// ============================================================
// ROUTE STOP REPOSITORY OPERATIONS
// ============================================================

export async function findStopById(schoolId, id, tx = prisma) {
  return tx.routeStop.findFirst({
    where: { schoolId, id },
    include: {
      route: {
        select: { id: true, name: true, routeNumber: true }
      }
    }
  });
}

export async function createRouteStop(schoolId, routeId, data, tx = prisma) {
  return tx.routeStop.create({
    data: {
      schoolId,
      routeId,
      stopName: data.stopName,
      pickupTime: data.pickupTime || null,
      dropTime: data.dropTime || null,
      stopOrder: data.stopOrder || 0
    }
  });
}

export async function updateRouteStop(schoolId, id, data, tx = prisma) {
  const updateData = {};
  if (data.stopName !== undefined) updateData.stopName = data.stopName;
  if (data.pickupTime !== undefined) updateData.pickupTime = data.pickupTime;
  if (data.dropTime !== undefined) updateData.dropTime = data.dropTime;
  if (data.stopOrder !== undefined) updateData.stopOrder = data.stopOrder;

  return tx.routeStop.update({
    where: { schoolId_id: { schoolId, id } },
    data: updateData
  });
}

export async function deleteRouteStop(schoolId, id, tx = prisma) {
  return tx.routeStop.delete({
    where: { schoolId_id: { schoolId, id } }
  });
}

// ============================================================
// STUDENT ASSIGNMENT OPERATIONS
// ============================================================

export async function countStudentsOnRoute(schoolId, routeId, tx = prisma) {
  return tx.student.count({
    where: { schoolId, transportRouteId: routeId }
  });
}

export async function findStudentInTenant(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: { schoolId, id: studentId }
  });
}

export async function assignStudentToRoute(schoolId, studentId, routeId, pickupStopId = null, tx = prisma) {
  return tx.student.update({
    where: { schoolId_id: { schoolId, id: studentId } },
    data: {
      transportRouteId: routeId,
      pickupStopId: pickupStopId || null
    },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      transportRoute: { select: { id: true, name: true, routeNumber: true, driverName: true, driverPhone: true } },
      pickupStop: { select: { id: true, stopName: true, pickupTime: true, dropTime: true } }
    }
  });
}

export async function unassignStudentFromRoute(schoolId, studentId, tx = prisma) {
  return tx.student.update({
    where: { schoolId_id: { schoolId, id: studentId } },
    data: {
      transportRouteId: null,
      pickupStopId: null
    },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } }
    }
  });
}

export async function findStudentAssignments(schoolId, filters = {}, tx = prisma) {
  const where = {
    schoolId,
    transportRouteId: { not: null }
  };

  if (filters.routeId) {
    where.transportRouteId = filters.routeId;
  }

  if (filters.classId) {
    where.classId = filters.classId;
  }

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { admissionNumber: { contains: q, mode: 'insensitive' } }
    ];
  }

  return tx.student.findMany({
    where,
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      transportRoute: {
        select: {
          id: true,
          name: true,
          routeNumber: true,
          driverName: true,
          driverPhone: true,
          vehicle: {
            select: { id: true, registrationNumber: true, model: true }
          }
        }
      },
      pickupStop: {
        select: { id: true, stopName: true, pickupTime: true, dropTime: true }
      }
    },
    orderBy: [{ classId: 'asc' }, { firstName: 'asc' }]
  });
}

// ============================================================
// STAFF / TEACHER / PARENT SCOPE HELPERS
// ============================================================

export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: { schoolId, userId },
    include: {
      user: { select: { id: true, isActive: true } },
      assignedClass: { select: { id: true, name: true } }
    }
  });
}

export async function findAuthorizedStudentIdsForParent(schoolId, parentUserId, tx = prisma) {
  const parentProfile = await tx.parentProfile.findFirst({
    where: { schoolId, userId: parentUserId },
    include: {
      children: {
        select: { studentId: true }
      }
    }
  });
  if (!parentProfile || !parentProfile.children) return [];
  return parentProfile.children.map(c => c.studentId);
}

export async function findStudentByUserId(schoolId, studentUserId, tx = prisma) {
  return tx.student.findFirst({
    where: { schoolId, userId: studentUserId }
  });
}
