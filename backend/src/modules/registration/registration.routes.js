import { Router } from 'express';
import * as registrationController from './registration.controller.js';
import * as registrationSchemas from './registration.schemas.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

/**
 * Public Registration Router mounted under /api/v1/public
 */
export const publicRegistrationRouter = Router();

// 1. School Registration: POST /api/v1/public/schools/register
publicRegistrationRouter.post(
  '/schools/register',
  rateLimit({ max: 5, windowMs: 60000, keyPrefix: 'rl:school-reg:' }),
  validate(registrationSchemas.registerSchoolSchema),
  registrationController.registerSchool
);

// 2. Teacher Registration: POST /api/v1/public/teachers/register
publicRegistrationRouter.post(
  '/teachers/register',
  rateLimit({ max: 10, windowMs: 60000, keyPrefix: 'rl:teacher-reg:' }),
  validate(registrationSchemas.registerTeacherSchema),
  registrationController.registerTeacher
);

// Alias: POST /api/v1/public/teacher-registration
publicRegistrationRouter.post(
  '/teacher-registration',
  rateLimit({ max: 10, windowMs: 60000, keyPrefix: 'rl:teacher-reg:' }),
  validate(registrationSchemas.registerTeacherSchema),
  registrationController.registerTeacher
);

// 3. Parent Registration: POST /api/v1/public/parents/register
publicRegistrationRouter.post(
  '/parents/register',
  rateLimit({ max: 10, windowMs: 60000, keyPrefix: 'rl:parent-reg:' }),
  validate(registrationSchemas.registerParentSchema),
  registrationController.registerParent
);

// Alias: POST /api/v1/public/parent-registration
publicRegistrationRouter.post(
  '/parent-registration',
  rateLimit({ max: 10, windowMs: 60000, keyPrefix: 'rl:parent-reg:' }),
  validate(registrationSchemas.registerParentSchema),
  registrationController.registerParent
);
