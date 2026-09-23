import * as customModulesService from './custom-modules.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

// ===========================================================================
// Custom Modules Controllers
// ===========================================================================

export async function listCustomModules(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const modules = await customModulesService.listCustomModules(schoolId);
    return ApiResponse.success(res, modules, 'Custom modules retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCustomModuleById(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const module = await customModulesService.getCustomModuleById(schoolId, id);
    return ApiResponse.success(res, module, 'Custom module retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function createCustomModule(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const user = req.user || {};
    const module = await customModulesService.createCustomModule(schoolId, req.body, user);
    return ApiResponse.success(res, module, 'Custom module created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
}

export async function updateCustomModule(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const user = req.user || {};
    const updated = await customModulesService.updateCustomModule(schoolId, id, req.body, user);
    return ApiResponse.success(res, updated, 'Custom module updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomModule(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const user = req.user || {};
    const result = await customModulesService.deleteCustomModule(schoolId, id, user);
    return ApiResponse.success(res, result, 'Custom module deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ===========================================================================
// Form Schemas Controllers
// ===========================================================================

export async function getFormSchema(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { moduleKey } = req.params;
    const schema = await customModulesService.getFormSchema(schoolId, moduleKey);
    return ApiResponse.success(res, schema, 'Form schema retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function upsertFormSchema(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { moduleKey } = req.params;
    const user = req.user || {};
    const schema = await customModulesService.upsertFormSchema(schoolId, moduleKey, req.body, user);
    return ApiResponse.success(res, schema, 'Form schema saved successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteFormSchema(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { moduleKey } = req.params;
    const user = req.user || {};
    const result = await customModulesService.deleteFormSchema(schoolId, moduleKey, user);
    return ApiResponse.success(res, result, 'Form schema deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ===========================================================================
// Dynamic Records Controllers
// ===========================================================================

export async function listModuleRecords(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id: moduleId } = req.params;
    const result = await customModulesService.listModuleRecords(schoolId, moduleId, req.query);
    return ApiResponse.paginated(
      res,
      result.records,
      result.pagination,
      'Module records retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
}

export async function getModuleRecordById(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id: moduleId, recordId } = req.params;
    const record = await customModulesService.getModuleRecordById(schoolId, moduleId, recordId);
    return ApiResponse.success(res, record, 'Module record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function createModuleRecord(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id: moduleId } = req.params;
    const user = req.user || {};
    const record = await customModulesService.createModuleRecord(schoolId, moduleId, req.body.data || req.body, user);
    return ApiResponse.success(res, record, 'Module record created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
}

export async function updateModuleRecord(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id: moduleId, recordId } = req.params;
    const user = req.user || {};
    const record = await customModulesService.updateModuleRecord(schoolId, moduleId, recordId, req.body.data || req.body, user);
    return ApiResponse.success(res, record, 'Module record updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteModuleRecord(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id: moduleId, recordId } = req.params;
    const user = req.user || {};
    const result = await customModulesService.deleteModuleRecord(schoolId, moduleId, recordId, user);
    return ApiResponse.success(res, result, 'Module record deleted successfully');
  } catch (error) {
    next(error);
  }
}
