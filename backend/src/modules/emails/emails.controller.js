import { ApiResponse } from '../../utils/api-response.js';
import * as emailService from '../../services/email.service.js';

/**
 * Controller for dispatching transactional emails via Nodemailer.
 */
export async function sendEmail(req, res, next) {
  try {
    const { to, subject, html, text } = req.body;
    const result = await emailService.sendMail({ to, subject, html, text });

    return ApiResponse.success(
      res,
      result,
      'Email dispatched successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}
