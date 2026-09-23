import { z } from 'zod';

const REGISTRATION_REGEX = /^[A-Z]{2}[ -]?[0-9]{1,2}(?:[ -]?[A-Z]{1,3})?[ -]?[0-9]{4}$/i;
const PHONE_REGEX = /^(?:\+?91|0)?[1-9]\d{9}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes vehicle registration number into uppercase with standard spacing/hyphens trimmed.
 *
 * @param {string} val
 * @returns {string}
 */
export function normalizeRegistrationNumber(val) {
  if (typeof val !== 'string') return '';
  return val.trim().toUpperCase();
}

/**
 * Normalizes phone number into clean 10-digit format.
 *
 * @param {string} val
 * @returns {string}
 */
export function normalizePhoneNumber(val) {
  if (typeof val !== 'string') return '';
  const digits = val.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
    return digits.slice(-10);
  }
  return val.trim();
}

// ============================================================
// VEHICLE SCHEMAS
// ============================================================

export const listVehiclesSchema = z.object({
  query: z.object({
    status: z.enum(['Active', 'Inactive']).optional(),
    search: z.string().trim().max(100).optional()
  })
});

export const vehicleIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Vehicle ID must be a valid UUID' })
  })
});

export const createVehicleSchema = z.object({
  body: z.object({
    registrationNumber: z
      .string()
      .trim()
      .min(4, 'Registration number must be at least 4 characters')
      .max(20, 'Registration number cannot exceed 20 characters')
      .refine((val) => REGISTRATION_REGEX.test(val), {
        message: 'Please enter a valid vehicle registration number (e.g. TN 56 K 1146 or MH-12-PQ-4567)'
      }),
    model: z.string().trim().max(100).nullable().optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be a positive integer').max(200, 'Capacity cannot exceed 200'),
    insuranceExpiry: z.string().regex(DATE_REGEX, { message: 'insuranceExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    pollutionExpiry: z.string().regex(DATE_REGEX, { message: 'pollutionExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    fitnessExpiry: z.string().regex(DATE_REGEX, { message: 'fitnessExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    status: z.enum(['Active', 'Inactive']).default('Active'),
    customData: z.record(z.unknown()).nullable().optional()
  })
});

export const updateVehicleSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Vehicle ID must be a valid UUID' })
  }),
  body: z.object({
    registrationNumber: z
      .string()
      .trim()
      .min(4, 'Registration number must be at least 4 characters')
      .max(20, 'Registration number cannot exceed 20 characters')
      .refine((val) => REGISTRATION_REGEX.test(val), {
        message: 'Please enter a valid vehicle registration number (e.g. TN 56 K 1146 or MH-12-PQ-4567)'
      })
      .optional(),
    model: z.string().trim().max(100).nullable().optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be a positive integer').max(200, 'Capacity cannot exceed 200').optional(),
    insuranceExpiry: z.string().regex(DATE_REGEX, { message: 'insuranceExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    pollutionExpiry: z.string().regex(DATE_REGEX, { message: 'pollutionExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    fitnessExpiry: z.string().regex(DATE_REGEX, { message: 'fitnessExpiry must be in YYYY-MM-DD format' }).nullable().optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    customData: z.record(z.unknown()).nullable().optional()
  })
});

// ============================================================
// ROUTE SCHEMAS
// ============================================================

export const listRoutesSchema = z.object({
  query: z.object({
    search: z.string().trim().max(100).optional(),
    vehicleId: z.string().uuid().optional()
  })
});

export const routeIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  })
});

export const createRouteSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Route name must be at least 2 characters').max(150, 'Route name cannot exceed 150 characters'),
    routeNumber: z.string().trim().max(50).nullable().optional(),
    vehicleId: z.string().uuid({ message: 'vehicleId must be a valid UUID' }).nullable().optional(),
    driverName: z.string().trim().max(100).nullable().optional(),
    driverPhone: z
      .string()
      .trim()
      .refine((val) => !val || PHONE_REGEX.test(val.replace(/[\s()-]/g, '')), {
        message: 'Please enter a valid 10-digit driver phone number'
      })
      .nullable()
      .optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be a positive integer').max(200).default(30)
  })
});

export const updateRouteSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  }),
  body: z.object({
    name: z.string().trim().min(2, 'Route name must be at least 2 characters').max(150, 'Route name cannot exceed 150 characters').optional(),
    routeNumber: z.string().trim().max(50).nullable().optional(),
    vehicleId: z.string().uuid({ message: 'vehicleId must be a valid UUID' }).nullable().optional(),
    driverName: z.string().trim().max(100).nullable().optional(),
    driverPhone: z
      .string()
      .trim()
      .refine((val) => !val || PHONE_REGEX.test(val.replace(/[\s()-]/g, '')), {
        message: 'Please enter a valid 10-digit driver phone number'
      })
      .nullable()
      .optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be a positive integer').max(200).optional()
  })
});

// ============================================================
// STOP SCHEMAS
// ============================================================

export const routeStopParamSchema = z.object({
  params: z.object({
    routeId: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  })
});

export const stopIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Stop ID must be a valid UUID' })
  })
});

export const createStopSchema = z.object({
  params: z.object({
    routeId: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  }),
  body: z.object({
    stopName: z.string().trim().min(2, 'Stop name must be at least 2 characters').max(150, 'Stop name cannot exceed 150 characters'),
    pickupTime: z.string().regex(TIME_REGEX, { message: 'pickupTime must be in HH:mm 24-hour format' }).nullable().optional(),
    dropTime: z.string().regex(TIME_REGEX, { message: 'dropTime must be in HH:mm 24-hour format' }).nullable().optional(),
    stopOrder: z.coerce.number().int().min(0, 'stopOrder must be a non-negative integer').default(0)
  })
});

export const updateStopSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Stop ID must be a valid UUID' })
  }),
  body: z.object({
    stopName: z.string().trim().min(2, 'Stop name must be at least 2 characters').max(150, 'Stop name cannot exceed 150 characters').optional(),
    pickupTime: z.string().regex(TIME_REGEX, { message: 'pickupTime must be in HH:mm 24-hour format' }).nullable().optional(),
    dropTime: z.string().regex(TIME_REGEX, { message: 'dropTime must be in HH:mm 24-hour format' }).nullable().optional(),
    stopOrder: z.coerce.number().int().min(0, 'stopOrder must be a non-negative integer').optional()
  })
});

// ============================================================
// ASSIGNMENT SCHEMAS
// ============================================================

export const listAssignmentsSchema = z.object({
  query: z.object({
    classId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    search: z.string().trim().max(100).optional()
  })
});

export const assignStudentSchema = z.object({
  params: z.object({
    routeId: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  }),
  body: z.object({
    studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
    pickupStopId: z.string().uuid({ message: 'pickupStopId must be a valid UUID' }).nullable().optional()
  })
});

export const unassignStudentSchema = z.object({
  params: z.object({
    routeId: z.string().uuid({ message: 'Route ID must be a valid UUID' })
  }),
  body: z.object({
    studentId: z.string().uuid({ message: 'studentId must be a valid UUID' })
  })
});
