import * as feeService from './fee.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Fee Domain Controller Handlers
 */

// ============================================================
// FEE COLLECTION PERIOD CONTROLLER HANDLERS
// ============================================================

/**
 * Lists fee collection periods with pagination.
 * GET /api/v1/fee-collection-periods
 */
export async function listCollectionPeriods(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { periods, pagination } = await feeService.listCollectionPeriods(schoolId, req.query);
    return ApiResponse.paginated(res, periods, pagination, 'Fee collection periods retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single fee collection period by ID.
 * GET /api/v1/fee-collection-periods/:id
 */
export async function getCollectionPeriod(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const period = await feeService.getCollectionPeriodById(schoolId, req.params.id);
    return ApiResponse.success(res, period, 'Fee collection period retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new fee collection period.
 * POST /api/v1/fee-collection-periods
 */
export async function createCollectionPeriod(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const created = await feeService.createCollectionPeriod(schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Fee collection period created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates an existing fee collection period.
 * PATCH /api/v1/fee-collection-periods/:id
 */
export async function updateCollectionPeriod(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await feeService.updateCollectionPeriod(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Fee collection period updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes a fee collection period.
 * DELETE /api/v1/fee-collection-periods/:id
 */
export async function deleteCollectionPeriod(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const result = await feeService.deleteCollectionPeriod(schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Fee collection period deleted successfully');
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// FEE STRUCTURE CONTROLLER HANDLERS
// ============================================================

/**
 * Lists fee structures with pagination and filters.
 * GET /api/v1/fee-structures
 */
export async function listFeeStructures(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { feeStructures, pagination } = await feeService.listFeeStructures(schoolId, req.query);
    return ApiResponse.paginated(res, feeStructures, pagination, 'Fee structures retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single fee structure by ID.
 * GET /api/v1/fee-structures/:id
 */
export async function getFeeStructure(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const feeStructure = await feeService.getFeeStructureById(schoolId, req.params.id);
    return ApiResponse.success(res, feeStructure, 'Fee structure retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a fee structure and automatically generates student invoices.
 * POST /api/v1/fee-structures
 */
export async function createFeeStructure(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const created = await feeService.createFeeStructure(schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Fee structure created and student invoices generated successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates an existing fee structure.
 * PATCH /api/v1/fee-structures/:id
 */
export async function updateFeeStructure(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await feeService.updateFeeStructure(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Fee structure updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes a fee structure.
 * DELETE /api/v1/fee-structures/:id
 */
export async function deleteFeeStructure(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const result = await feeService.deleteFeeStructure(schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Fee structure deleted successfully');
  } catch (error) {
    return next(error);
  }
}
