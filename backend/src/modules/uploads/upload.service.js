/* global fetch, FormData, Blob */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { CloudinaryService } from '../../services/cloudinary.service.js';
import { cloudinaryConfig } from '../../config/cloudinary.js';
import { ValidationError } from '../../utils/app-error.js';
import { env } from '../../config/env.js';

export const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE, files: 1 }
}).single('file');

/**
 * Handles multer file extraction with friendly error formatting.
 */
export function handleFileUpload(req, res, next) {
  uploadMiddleware(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ValidationError('File exceeds the 15MB size limit'));
    }
    return next(new ValidationError(err.message || 'File upload failed'));
  });
}

function safeExtension(originalName = '') {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 10 ? ext : '';
}

async function uploadToCloudinary(file) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = env.RESOURCE_CLOUDINARY_FOLDER || 'school-management';
  const signature = CloudinaryService.generateSignature({ folder, timestamp });
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('api_key', cloudinaryConfig.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/auto/upload`, {
    method: 'POST',
    body: form
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.secure_url) {
    throw new Error(body?.error?.message || 'Cloudinary upload failed');
  }
  return body.secure_url;
}

/**
 * Stores an uploaded file (Cloudinary if configured, otherwise local disk)
 * and returns its public URL.
 */
export async function storeUploadFile(file, schoolId = 'general', req) {
  if (CloudinaryService.isConfigured()) {
    try {
      return await uploadToCloudinary(file);
    } catch (err) {
      console.warn('[UPLOADS] Cloudinary upload failed, falling back to local storage:', err.message);
    }
  }

  const cleanSchoolId = String(schoolId || 'general').replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  const dir = path.join(UPLOADS_ROOT, 'files', cleanSchoolId);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomUUID()}${safeExtension(file.originalname)}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0];
  const host = req.get('host') || 'localhost:5000';
  return `${proto}://${host}/uploads/files/${cleanSchoolId}/${filename}`;
}
