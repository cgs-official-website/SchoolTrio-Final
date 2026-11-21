import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { handleFileUpload } from './upload.service.js';
import * as uploadController from './upload.controller.js';

export const uploadRoutes = Router();

uploadRoutes.get('/config', uploadController.getUploadConfig);

uploadRoutes.post(
  '/',
  optionalAuth,
  tenantContext({ requireTenant: false }),
  handleFileUpload,
  uploadController.uploadFile
);

export default uploadRoutes;
