import * as zunaSupportService from './zuna-support.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export const listTickets = async (req, res, next) => {
  try {
    const result = await zunaSupportService.listTickets(req.user, req.query);
    return ApiResponse.success(res, result.tickets);
  } catch (err) {
    next(err);
  }
};

export const createTicket = async (req, res, next) => {
  try {
    const result = await zunaSupportService.createTicket(req.user, req.body);
    return ApiResponse.success(res, result, 'Ticket submitted to Zuna Central Support', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getTicket = async (req, res, next) => {
  try {
    const ticket = await zunaSupportService.getTicket(req.user, req.params.id);
    return ApiResponse.success(res, ticket);
  } catch (err) {
    next(err);
  }
};

export const addMessage = async (req, res, next) => {
  try {
    const message = await zunaSupportService.addMessage(req.user, req.params.id, req.body);
    return ApiResponse.success(res, message, 'Reply sent', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};
