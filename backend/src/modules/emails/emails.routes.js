import { Router } from 'express';
import * as emailsController from './emails.controller.js';
import * as emailsSchemas from './emails.schemas.js';
import { validate } from '../../middleware/validate.middleware.js';

const emailsRouter = Router();

emailsRouter.post(
  '/send',
  validate(emailsSchemas.sendEmailSchema),
  emailsController.sendEmail
);

export { emailsRouter, emailsRouter as emailsRoutes };
export default emailsRouter;

