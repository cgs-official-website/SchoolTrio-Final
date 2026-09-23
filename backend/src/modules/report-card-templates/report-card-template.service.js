import * as reportCardTemplateRepository from './report-card-template.repository.js';
import { templateConfigSchema, templateTypeSchema } from './report-card-template.schemas.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { TenantAccessError, ValidationError } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';

/**
 * Report Card Template Service
 * Core business domain logic for configuring, saving, and retrieving school report card templates.
 */

/**
 * Authoritative default report card template configuration fallback.
 */
export const DEFAULT_REPORT_CARD_CONFIG = Object.freeze({
  themeColor: '#3b82f6',
  header: {
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showEmail: true,
    title: 'PROGRESS REPORT',
    subtitle: 'Academic Performance Record'
  },
  studentFields: {
    admissionNo: true,
    dob: true,
    fatherName: true,
    motherName: true,
    attendance: true
  },
  grading: {
    style: 'marks_and_grades',
    showTotal: true,
    showPercentage: true,
    showRank: false
  },
  footer: {
    signatures: ['Class Teacher', 'Principal', 'Parent'],
    gradingScaleText: 'A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33',
    remarks: true
  }
});

/**
 * Serializes a ReportCardTemplate record for clean API output.
 *
 * @param {Object} template - ReportCardTemplate database record
 * @param {boolean} [isDefault=false] - Whether this is the default fallback
 * @returns {Object}
 */
export function serializeTemplate(template, isDefault = false) {
  if (!template) return null;
  return {
    id: template.id || null,
    schoolId: template.schoolId,
    templateType: template.templateType || 'report_card',
    config: template.config || DEFAULT_REPORT_CARD_CONFIG,
    isDefault,
    createdAt: template.createdAt || null,
    updatedAt: template.updatedAt || null
  };
}

/**
 * Normalizes and validates the templateType parameter.
 *
 * @param {string} [templateType='report_card']
 * @returns {string}
 */
function normalizeTemplateType(templateType = 'report_card') {
  const result = templateTypeSchema.safeParse(templateType);
  if (!result.success) {
    throw new ValidationError('Invalid template type format', result.error.errors);
  }
  return result.data;
}

/**
 * Retrieves the active report card template for a tenant.
 * If no custom template exists, returns the authoritative system default configuration.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} [templateType='report_card'] - Template type identifier
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function getReportCardTemplate(schoolId, templateType = 'report_card', _actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve template');
  }

  const normalizedType = normalizeTemplateType(templateType);
  const template = await reportCardTemplateRepository.findTemplateByType(schoolId, normalizedType);

  if (!template) {
    return serializeTemplate(
      {
        id: null,
        schoolId,
        templateType: normalizedType,
        config: DEFAULT_REPORT_CARD_CONFIG,
        createdAt: null,
        updatedAt: null
      },
      true
    );
  }

  return serializeTemplate(template, false);
}

/**
 * Creates or updates the report card template for a tenant.
 * Atomically upserts the configuration and records non-blocking audit logs.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} [templateType='report_card'] - Template type identifier
 * @param {Object} configData - Template JSON configuration
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function saveReportCardTemplate(schoolId, templateType = 'report_card', configData = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to save template');
  }

  const normalizedType = normalizeTemplateType(templateType);

  // Validate configuration shape
  const validationResult = templateConfigSchema.safeParse(configData);
  if (!validationResult.success) {
    throw new ValidationError('Invalid template configuration', validationResult.error.errors);
  }
  const validatedConfig = validationResult.data;

  // Check if updating or creating for accurate audit log action
  const existingTemplate = await reportCardTemplateRepository.findTemplateByType(schoolId, normalizedType);
  const isExisting = Boolean(existingTemplate);

  // Execute atomic upsert
  const savedTemplate = await reportCardTemplateRepository.upsertTemplate(
    schoolId,
    normalizedType,
    validatedConfig
  );

  // Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    const userName = actor?.name || actor?.email || 'Administrator';
    const userRole = actor?.systemRole || actor?.role || null;

    await createAuditLog({
      schoolId,
      userId,
      entityType: 'ReportCardTemplate',
      entityId: savedTemplate.id,
      actionPerformed: isExisting ? 'UPDATE_REPORT_CARD_TEMPLATE' : 'CREATE_REPORT_CARD_TEMPLATE',
      userName,
      userRole,
      modifiedFields: {
        templateType: normalizedType,
        themeColor: validatedConfig.themeColor || null
      }
    });
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record template audit log', error: auditErr.message });
  }

  return serializeTemplate(savedTemplate, false);
}

/**
 * Deletes a custom report card template for a tenant, restoring default fallback behavior.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} [templateType='report_card'] - Template type identifier
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ message: string, templateType: string }>}
 */
export async function deleteReportCardTemplate(schoolId, templateType = 'report_card', actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete template');
  }

  const normalizedType = normalizeTemplateType(templateType);
  const existingTemplate = await reportCardTemplateRepository.findTemplateByType(schoolId, normalizedType);

  if (existingTemplate) {
    await reportCardTemplateRepository.deleteTemplate(schoolId, normalizedType);

    // Non-blocking Audit Logging
    try {
      const userId = actor ? (actor.id || actor.userId) : null;
      const userName = actor?.name || actor?.email || 'Administrator';
      const userRole = actor?.systemRole || actor?.role || null;

      await createAuditLog({
        schoolId,
        userId,
        entityType: 'ReportCardTemplate',
        entityId: existingTemplate.id,
        actionPerformed: 'DELETE_REPORT_CARD_TEMPLATE',
        userName,
        userRole,
        modifiedFields: {
          templateType: normalizedType
        }
      });
    } catch (auditErr) {
      logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record template deletion audit log', error: auditErr.message });
    }
  }

  return {
    message: 'Report card template reset to default successfully',
    templateType: normalizedType
  };
}
