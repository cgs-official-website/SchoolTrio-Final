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

// Distance in km (replaces the old free-text "slab name"). Blank -> null.
const distanceKm = z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: 'Distance must be a number' }).min(0, 'Distance cannot be negative').max(9999, 'Distance is too large').nullable().optional()
);

// Bus stop distance is mandatory: it decides which distance-slab fee applies to the stop
const requiredDistanceKm = z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: 'Distance (KM) is required', required_error: 'Distance (KM) is required' })
        .min(0, 'Distance cannot be negative').max(9999, 'Distance is too large')
);

const busStopBody = {
    stopName: z.string().trim().min(1, 'Stop name is required').max(150, 'Stop name cannot exceed 150 characters'),
    distanceKm: requiredDistanceKm,
    slabName: optionalText(100), // legacy - still accepted
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

// One simple amount per entry. A fee is either for one bus stop (kind STOP)
// or for a distance slab in km (kind SLAB) that covers every stop with that distance.
const busFeeBody = z
    .object({
        kind: z.enum(['STOP', 'SLAB']),
        busStopId: uuid('busStopId').nullable().optional(),
        distanceKm, // legacy single distance - still accepted
        distanceFromKm: distanceKm, // slab range start (KM)
        distanceToKm: distanceKm, // slab range end (KM)
        slabName: optionalText(100), // legacy - still accepted
        dueDate: dateStr('Due date'),
        amount: amount('Fee amount')
    })
    .superRefine((d, ctx) => {
        if (d.kind === 'STOP' && !d.busStopId) {
            ctx.addIssue({ code: 'custom', path: ['busStopId'], message: 'Bus stop is required' });
        }
        if (d.kind === 'SLAB') {
            const hasFrom = d.distanceFromKm !== null && d.distanceFromKm !== undefined;
            const hasTo = d.distanceToKm !== null && d.distanceToKm !== undefined;
            const hasLegacy = (d.distanceKm !== null && d.distanceKm !== undefined) || Boolean(d.slabName && d.slabName.trim());
            if (hasFrom !== hasTo) {
                ctx.addIssue({ code: 'custom', path: [hasFrom ? 'distanceToKm' : 'distanceFromKm'], message: 'Enter both From KM and To KM' });
            } else if (!hasFrom && !hasLegacy) {
                ctx.addIssue({ code: 'custom', path: ['distanceFromKm'], message: 'Distance range (From KM and To KM) is required' });
            } else if (hasFrom && Number(d.distanceFromKm) > Number(d.distanceToKm)) {
                ctx.addIssue({ code: 'custom', path: ['distanceToKm'], message: 'To KM must be greater than or equal to From KM' });
            }
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

// ---------------- PARENT / STUDENT SELF-SERVICE ----------------
export const myTransportSchema = z.object({
    query: z.object({ studentId: z.string().uuid().optional() })
});

// ---------------- FEE REPORTS: TRANSPORT ----------------
export const transportReportStudentsSchema = z.object({ query: z.object({}).passthrough() });

export const transportReportPaymentsSchema = z.object({
    query: z.object({
        from: z.string().regex(DATE_REGEX, { message: 'From date must be in YYYY-MM-DD format' }).optional(),
        to: z.string().regex(DATE_REGEX, { message: 'To date must be in YYYY-MM-DD format' }).optional()
    })
});
