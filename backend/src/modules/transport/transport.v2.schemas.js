import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TRAVEL_MODES = ['Pickup & Drop', 'Pickup', 'Drop'];

const uuid = (label) => z.string().uuid({ message: `${label} must be a valid UUID` });
const optionalText = (max) =>
    z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
        z.string().trim().max(max).nullable().optional()
    );
const amount = (label) =>
    z.coerce
        .number({ invalid_type_error: `${label} must be a number` })
        .min(0, `${label} cannot be negative`)
        .max(10000000, `${label} is too large`);
const dateStr = (label) => z.string().regex(DATE_REGEX, { message: `${label} must be in YYYY-MM-DD format` });

// ---------------- BUS STOPS ----------------
export const listBusStopsSchema = z.object({
    query: z.object({ search: z.string().trim().max(100).optional(), routeId: z.string().uuid().optional() })
});

export const busStopIdParamSchema = z.object({
    params: z.object({ id: uuid('Bus stop ID') })
});

const busStopBody = {
    stopName: z.string().trim().min(1, 'Stop name is required').max(150, 'Stop name cannot exceed 150 characters'),
    slabName: optionalText(100),
    geocode: optionalText(100),
    routeIds: z.array(uuid('routeId')).min(1, 'Select at least one route').max(200)
};

export const createBusStopSchema = z.object({ body: z.object(busStopBody) });

export const updateBusStopSchema = z.object({
    params: z.object({ id: uuid('Bus stop ID') }),
    body: z.object(busStopBody)
});

// ---------------- BUS FEES ----------------
export const listBusFeesSchema = z.object({
    query: z.object({
        kind: z.enum(['STOP', 'SLAB']).optional(),
        search: z.string().trim().max(100).optional()
    })
});

export const busFeeIdParamSchema = z.object({
    params: z.object({ id: uuid('Fee ID') })
});

const busFeeBody = z
    .object({
        kind: z.enum(['STOP', 'SLAB']),
        busStopId: uuid('busStopId').nullable().optional(),
        slabName: optionalText(100),
        dueDate: dateStr('Due date'),
        oneWayAmount: amount('One way fee'),
        twoWayAmount: amount('Two way fee')
    })
    .superRefine((d, ctx) => {
        if (d.kind === 'STOP' && !d.busStopId) {
            ctx.addIssue({ code: 'custom', path: ['busStopId'], message: 'Bus stop is required' });
        }
        if (d.kind === 'SLAB' && !(d.slabName && d.slabName.trim())) {
            ctx.addIssue({ code: 'custom', path: ['slabName'], message: 'Slab name is required' });
        }
    });

export const createBusFeeSchema = z.object({ body: busFeeBody });
export const updateBusFeeSchema = z.object({
    params: z.object({ id: uuid('Fee ID') }),
    body: busFeeBody
});

// ---------------- STUDENT MAPPINGS ----------------
export const createMappingSchema = z.object({
    body: z.object({
        routeId: uuid('routeId'),
        busStopId: uuid('busStopId'),
        travelMode: z.enum(TRAVEL_MODES),
        effectFrom: dateStr('Effect from'),
        studentIds: z.array(uuid('studentId')).min(1, 'Select at least one student').max(300)
    })
});

export const updateMappingSchema = z.object({
    params: z.object({ studentId: uuid('studentId') }),
    body: z.object({
        routeId: uuid('routeId'),
        busStopId: uuid('busStopId'),
        travelMode: z.enum(TRAVEL_MODES),
        effectFrom: dateStr('Effect from')
    })
});

export const mappingStudentParamSchema = z.object({
    params: z.object({ studentId: uuid('studentId') })
});
