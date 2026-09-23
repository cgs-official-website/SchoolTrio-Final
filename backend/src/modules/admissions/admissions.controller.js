import * as admissionsService from './admissions.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Admissions & Lead Management Controller Layer
 */

function getTenantId(req) {
  return req.tenant?.schoolId || req.schoolId || req.user?.schoolId || req.auth?.schoolId;
}

// =========================================================================
// 1. ADMIN LEADS CONTROLLERS
// =========================================================================

export async function listLeads(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const { leads, pagination } = await admissionsService.listLeads(schoolId, req.query);
    return ApiResponse.paginated(res, leads, pagination, 'Admission leads retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getLead(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const lead = await admissionsService.getLeadById(schoolId, req.params.id);
    return ApiResponse.success(res, lead, 'Admission lead retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateLeadStatus(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const updated = await admissionsService.updateLeadStatus(
      schoolId,
      req.params.id,
      req.body.status,
      req.user || req.auth
    );
    return ApiResponse.success(res, updated, 'Lead status updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteLead(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const result = await admissionsService.deleteLead(schoolId, req.params.id, req.user || req.auth);
    return ApiResponse.success(res, result, 'Lead deleted successfully');
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// 2. ADMIN LEAD FORMS CONTROLLERS
// =========================================================================

export async function listLeadForms(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const { forms, pagination } = await admissionsService.listLeadForms(schoolId, req.query);
    return ApiResponse.paginated(res, forms, pagination, 'Lead forms retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getLeadForm(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const form = await admissionsService.getLeadFormById(schoolId, req.params.id);
    return ApiResponse.success(res, form, 'Lead form retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function createLeadForm(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const created = await admissionsService.createLeadForm(schoolId, req.body, req.user || req.auth);
    return ApiResponse.success(res, created, 'Lead form created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function updateLeadForm(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const updated = await admissionsService.updateLeadForm(
      schoolId,
      req.params.id,
      req.body,
      req.user || req.auth
    );
    return ApiResponse.success(res, updated, 'Lead form updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteLeadForm(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const result = await admissionsService.deleteLeadForm(schoolId, req.params.id, req.user || req.auth);
    return ApiResponse.success(res, result, 'Lead form deleted successfully');
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// 3. ADMIN ADMISSION APPLICATIONS CONTROLLERS
// =========================================================================

export async function listApplications(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const { applications, pagination } = await admissionsService.listApplications(schoolId, req.query);
    return ApiResponse.paginated(res, applications, pagination, 'Admission applications retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getApplication(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const application = await admissionsService.getApplicationById(schoolId, req.params.id);
    return ApiResponse.success(res, application, 'Admission application retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateApplicationStatus(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const updated = await admissionsService.updateApplicationStatus(
      schoolId,
      req.params.id,
      req.body.status,
      req.body.remarks,
      req.user || req.auth
    );
    return ApiResponse.success(res, updated, 'Application status updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteApplication(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const result = await admissionsService.deleteApplication(schoolId, req.params.id, req.user || req.auth);
    return ApiResponse.success(res, result, 'Application deleted successfully');
  } catch (err) {
    next(err);
  }
}

export async function enrollApplication(req, res, next) {
  try {
    const schoolId = getTenantId(req);
    const result = await admissionsService.enrollApplication(
      schoolId,
      req.params.id,
      req.body,
      req.user || req.auth
    );
    return ApiResponse.success(res, result, 'Application successfully enrolled as active student', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// 4. PUBLIC CONTROLLERS (Unauthenticated, Rate-limited)
// =========================================================================

export async function getPublicSchoolAdmissionMeta(req, res, next) {
  try {
    const meta = await admissionsService.getPublicSchoolAdmissionMeta(req.params.schoolId);
    return ApiResponse.success(res, meta, 'School admission metadata retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getPublicLeadForm(req, res, next) {
  try {
    const form = await admissionsService.getPublicLeadForm(req.params.schoolId, req.params.formId);
    return ApiResponse.success(res, form, 'Public lead form retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function submitPublicLead(req, res, next) {
  try {
    const result = await admissionsService.submitPublicLead(
      req.params.schoolId,
      req.params.formId,
      req.body
    );
    return ApiResponse.success(res, result, 'Enquiry submitted successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function submitPublicAdmission(req, res, next) {
  try {
    const result = await admissionsService.submitPublicAdmission(
      req.params.schoolId,
      req.body
    );
    return ApiResponse.success(res, result, 'Admission application submitted successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}
