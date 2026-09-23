import { describe, it, expect, vi } from 'vitest';
import { ApiResponse } from '../../src/utils/api-response.js';

describe('Unit: ApiResponse Utility', () => {
  it('ApiResponse.success formats a standard 200 payload', () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    const data = { id: 'test-123', name: 'Test School' };
    ApiResponse.success(mockRes, data, 'Success message');

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success message',
      data
    });
  });

  it('ApiResponse.success supports custom status codes', () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    ApiResponse.success(mockRes, { created: true }, null, 201);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      data: { created: true }
    });
  });

  it('ApiResponse.paginated formats pagination metadata correctly', () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    const data = [{ id: 1 }, { id: 2 }];
    const pagination = {
      page: 1,
      limit: 20,
      total: 50,
      totalPages: 3
    };

    ApiResponse.paginated(mockRes, data, pagination);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      data,
      pagination: {
        page: 1,
        limit: 20,
        total: 50,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false
      }
    });
  });
});
