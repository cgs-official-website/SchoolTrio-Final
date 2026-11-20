import * as svc from './transport.v2.service.js';

const handler = (fn, { status = 200, message } = {}) => async (req, res, next) => {
    try {
        const schoolId = req.tenant?.schoolId;
        const actor = req.auth || req.user;
        const data = await fn({ schoolId, actor, req });
        const body = { status: 'success', data };
        if (message) body.message = message;
        res.status(status).json(body);
    } catch (err) {
        next(err);
    }
};

// Bus stops
export const listBusStops = handler(({ schoolId, req }) => svc.listBusStops(schoolId, req.query));
export const listSlabNames = handler(({ schoolId }) => svc.listSlabNames(schoolId));
export const getBusStop = handler(({ schoolId, req }) => svc.getBusStop(schoolId, req.params.id));
export const createBusStop = handler(({ schoolId, actor, req }) => svc.createBusStop(schoolId, req.body, actor), { status: 201, message: 'Bus stop created successfully' });
export const updateBusStop = handler(({ schoolId, actor, req }) => svc.updateBusStop(schoolId, req.params.id, req.body, actor), { message: 'Bus stop updated successfully' });
export const deleteBusStop = handler(({ schoolId, actor, req }) => svc.deleteBusStop(schoolId, req.params.id, actor), { message: 'Bus stop deleted successfully' });

// Bus fees
export const listBusFees = handler(({ schoolId, req }) => svc.listBusFees(schoolId, req.query));
export const getBusFee = handler(({ schoolId, req }) => svc.getBusFee(schoolId, req.params.id));
export const createBusFee = handler(({ schoolId, actor, req }) => svc.createBusFee(schoolId, req.body, actor), { status: 201, message: 'Fee entry created successfully' });
export const updateBusFee = handler(({ schoolId, actor, req }) => svc.updateBusFee(schoolId, req.params.id, req.body, actor), { message: 'Fee entry updated successfully' });
export const deleteBusFee = handler(({ schoolId, actor, req }) => svc.deleteBusFee(schoolId, req.params.id, actor), { message: 'Fee entry deleted successfully' });

export const syncTransportInvoices = handler(({ schoolId, actor }) => svc.syncAllInvoices(schoolId, actor), { message: 'Transport fees synced to student invoices' });

// Student mappings
export const createMappings = handler(({ schoolId, actor, req }) => svc.createMappings(schoolId, req.body, actor), { status: 201, message: 'Students mapped successfully' });
export const updateMapping = handler(({ schoolId, actor, req }) => svc.updateMapping(schoolId, req.params.studentId, req.body, actor), { message: 'Mapping updated successfully' });
export const deleteMapping = handler(({ schoolId, actor, req }) => svc.deleteMapping(schoolId, req.params.studentId, actor), { message: 'Student unmapped successfully' });

// Parent / student self-service
export const getMyTransport = handler(({ schoolId, actor, req }) => svc.getMyTransport(schoolId, req.query, actor));
