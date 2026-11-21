import { ApiResponse } from '../../utils/api-response.js';
import { ValidationError } from '../../utils/app-error.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { storeUploadFile, MAX_UPLOAD_FILE_SIZE } from './upload.service.js';

/**
 * Handles generic file upload.
 * POST /api/v1/uploads
 */
export async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      throw new ValidationError('No file provided for upload');
    }

    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.body?.schoolId || 'general';
    const fileUrl = await storeUploadFile(req.file, schoolId, req);

    return ApiResponse.success(
      res,
      {
        fileUrl,
        url: fileUrl,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      },
      'File uploaded successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Returns upload configuration parameters (e.g. max file size).
 * GET /api/v1/uploads/config
 */
export function getUploadConfig(_req, res) {
  return ApiResponse.success(res, {
    maxFileSizeBytes: MAX_UPLOAD_FILE_SIZE,
    maxFileSizeMb: Math.round(MAX_UPLOAD_FILE_SIZE / (1024 * 1024))
  });
}
