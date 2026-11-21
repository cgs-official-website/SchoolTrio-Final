import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as uploadController from './upload.controller.js';
import * as uploadService from './upload.service.js';
import { ValidationError } from '../../utils/app-error.js';

describe('Uploads Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUploadConfig', () => {
    it('returns configuration object with size constraints', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      uploadController.getUploadConfig({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          maxFileSizeBytes: uploadService.MAX_UPLOAD_FILE_SIZE,
          maxFileSizeMb: expect.any(Number)
        })
      }));
    });
  });

  describe('uploadFile controller', () => {
    it('throws ValidationError if no file is attached', async () => {
      const req = { file: null };
      const next = vi.fn();

      await uploadController.uploadFile(req, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(next.mock.calls[0][0].message).toContain('No file provided');
    });

    it('successfully uploads file and returns response with fileUrl', async () => {
      const mockFile = {
        originalname: 'test-document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test pdf content')
      };

      const req = {
        file: mockFile,
        tenant: { schoolId: 'test-school-123' },
        auth: { userId: 'user-456' },
        get: vi.fn().mockReturnValue('localhost:5000'),
        protocol: 'http',
        headers: {}
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await uploadController.uploadFile(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          fileUrl: expect.stringContaining('/uploads/files/test-school-123/'),
          originalName: 'test-document.pdf',
          mimeType: 'application/pdf',
          size: 1024
        })
      }));
    });
  });
});
