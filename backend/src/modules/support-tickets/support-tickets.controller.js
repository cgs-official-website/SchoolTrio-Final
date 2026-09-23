import * as supportTicketsService from './support-tickets.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export const listTickets = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await supportTicketsService.getTenantTickets(schoolId, req.query);
    return ApiResponse.paginated(res, result.tickets, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const createTicket = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const user = req.auth || req.user;
    const ticket = await supportTicketsService.createTicket(schoolId, user, req.body);
    return ApiResponse.success(res, ticket, 'Support ticket created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getTicket = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const ticket = await supportTicketsService.getTenantTicketById(schoolId, id);
    return ApiResponse.success(res, ticket);
  } catch (err) {
    next(err);
  }
};

export const addMessage = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const user = req.auth || req.user;
    const { id } = req.params;
    const message = await supportTicketsService.addTenantTicketMessage(schoolId, user, id, req.body);
    return ApiResponse.success(res, message, 'Message added successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const superAdminListTickets = async (req, res, next) => {
  try {
    const result = await supportTicketsService.getGlobalTickets(req.query);
    return ApiResponse.paginated(res, result.tickets, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const superAdminUpdateStatus = async (req, res, next) => {
  try {
    const user = req.auth || req.user;
    const { id } = req.params;
    const { status } = req.body;
    const updated = await supportTicketsService.updateTicketStatus(id, status, user);
    return ApiResponse.success(res, updated, 'Ticket status updated successfully');
  } catch (err) {
    next(err);
  }
};

export const superAdminAddMessage = async (req, res, next) => {
  try {
    const user = req.auth || req.user;
    const { id } = req.params;
    const message = await supportTicketsService.addSuperAdminTicketMessage(user, id, req.body);
    return ApiResponse.success(res, message, 'Reply sent successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};
