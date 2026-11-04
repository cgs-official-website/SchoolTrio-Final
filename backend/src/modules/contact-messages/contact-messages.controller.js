import * as service from './contact-messages.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export const submitMessage = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || null;

    const result = await service.submitMessage(req.body, { ipAddress, userAgent });
    return ApiResponse.success(res, result, 'Thank you! Your message has been sent successfully.', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const result = await service.listMessages(req.query);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await service.getMessageById(id);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await service.updateMessageStatus(id, status);
    return ApiResponse.success(res, result, 'Status updated successfully');
  } catch (err) {
    next(err);
  }
};

export const replyToMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    const user = req.auth || req.user || {};
    const result = await service.replyToMessage(id, reply, user);

    let message = 'Reply sent and saved successfully.';
    if (result.emailDeliveryStatus === 'not_configured') {
      message = 'Reply saved in database. Note: Email service is not configured on the server, so no email was dispatched.';
    } else if (result.emailDeliveryStatus === 'failed') {
      message = `Reply saved in database. Note: Email delivery failed: ${result.emailDeliveryError || 'Unknown error'}.`;
    }

    return ApiResponse.success(res, result, message);
  } catch (err) {
    next(err);
  }
};

