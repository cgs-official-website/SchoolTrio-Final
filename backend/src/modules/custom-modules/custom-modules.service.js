import * as customModulesRepo from './custom-modules.repository.js';
import * as settingsRepo from '../settings/settings.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/app-error.js';
import { checkPrototypePollution } from './custom-modules.schemas.js';

// Default core schemas for fallback
const DEFAULT_CORE_SCHEMAS = {
  staff: {
    sections: [
      {
        id: 'sec_1',
        title: 'Personal Details',
        fields: [
          { id: 'f_1', label: 'First Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_2', label: 'Last Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_3', label: 'Email', type: 'email', required: true, options: '', relationModule: '' },
          { id: 'f_4', label: 'Phone', type: 'text', required: true, options: '', relationModule: '' }
        ]
      },
      {
        id: 'sec_2',
        title: 'Academic Details',
        fields: [
          { id: 'f_5', label: 'Qualification', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_6', label: 'Experience (Years)', type: 'number', required: false, options: '', relationModule: '' }
        ]
      }
    ]
  },
  students: {
    sections: [
      {
        id: 'sec_1',
        title: 'Student Details',
        fields: [
          { id: 'f_1', label: 'First Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_2', label: 'Last Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_3', label: 'Date of Birth', type: 'date', required: true, options: '', relationModule: '' }
        ]
      },
      {
        id: 'sec_2',
        title: 'Parent Details',
        fields: [
          { id: 'f_4', label: 'Parent Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_5', label: 'Parent Phone', type: 'text', required: true, options: '', relationModule: '' }
        ]
      }
    ]
  }
};

// ===========================================================================
// Custom Modules Service
// ===========================================================================

export async function listCustomModules(schoolId) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  return customModulesRepo.findModules(schoolId);
}

export async function getCustomModuleById(schoolId, id) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  const module = await customModulesRepo.findModuleById(schoolId, id);
  if (!module) {
    throw new NotFoundError(`Custom module not found with ID: ${id}`);
  }
  return module;
}

export async function createCustomModule(schoolId, moduleData, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');

  checkPrototypePollution(moduleData);

  const existing = await customModulesRepo.findModuleByName(schoolId, moduleData.name);
  if (existing) {
    throw new ConflictError(`Custom module with name "${moduleData.name}" already exists`);
  }

  const existingCount = await customModulesRepo.countModules(schoolId);
  const order = moduleData.order ?? existingCount;

  return customModulesRepo.executeTransaction(async (tx) => {
    // 1. Create Custom Module
    const newModule = await customModulesRepo.createModule(
      schoolId,
      {
        name: moduleData.name,
        icon: moduleData.icon || 'Folder',
        order,
        isActive: true
      },
      tx
    );

    // 2. Create Initial Default Schema
    const initialSections = [
      {
        id: `sec_${Date.now()}`,
        title: 'General Details',
        fields: [
          {
            id: `field_${Date.now()}`,
            label: 'Name',
            type: 'text',
            required: true,
            options: '',
            relationModule: ''
          }
        ]
      }
    ];

    await customModulesRepo.upsertSchema(schoolId, newModule.id, initialSections, tx);

    // 3. Append to Sidebar Layout Setting
    const sidebarSetting = await settingsRepo.findSetting(schoolId, 'sidebar', tx);
    const currentOrder = Array.isArray(sidebarSetting?.data?.order) ? [...sidebarSetting.data.order] : [];
    if (!currentOrder.includes(newModule.id)) {
      currentOrder.push(newModule.id);
      await settingsRepo.upsertSetting(schoolId, 'sidebar', { order: currentOrder }, tx);
    }

    // 4. Audit Log
    await createAuditLog(
      {
        schoolId,
        entityType: 'CustomModule',
        entityId: newModule.id,
        actionPerformed: 'Created custom module',
        userName: user.email || user.name || 'Administrator',
        userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
        modifiedFields: {
          name: newModule.name,
          order: newModule.order
        }
      },
      tx
    );

    return newModule;
  });
}

export async function updateCustomModule(schoolId, id, updateData, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');

  checkPrototypePollution(updateData);

  const existing = await customModulesRepo.findModuleById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Custom module not found with ID: ${id}`);
  }

  if (updateData.name && updateData.name !== existing.name) {
    const duplicate = await customModulesRepo.findModuleByName(schoolId, updateData.name);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError(`Custom module with name "${updateData.name}" already exists`);
    }
  }

  const updated = await customModulesRepo.updateModule(schoolId, id, updateData);

  await createAuditLog({
    schoolId,
    entityType: 'CustomModule',
    entityId: id,
    actionPerformed: 'Updated custom module',
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: updateData
  });

  return updated;
}

export async function deleteCustomModule(schoolId, id, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');

  const existing = await customModulesRepo.findModuleById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Custom module not found with ID: ${id}`);
  }

  return customModulesRepo.executeTransaction(async (tx) => {
    // 1. Delete all dynamic records
    await customModulesRepo.deleteRecordsByModule(schoolId, id, tx);

    // 2. Delete schema
    await customModulesRepo.deleteSchema(schoolId, id, tx);

    // 3. Delete module
    await customModulesRepo.deleteModule(schoolId, id, tx);

    // 4. Clean up sidebar setting
    const sidebarSetting = await settingsRepo.findSetting(schoolId, 'sidebar', tx);
    if (Array.isArray(sidebarSetting?.data?.order)) {
      const filteredOrder = sidebarSetting.data.order.filter((modId) => modId !== id);
      await settingsRepo.upsertSetting(schoolId, 'sidebar', { order: filteredOrder }, tx);
    }

    // 5. Audit Log
    await createAuditLog(
      {
        schoolId,
        entityType: 'CustomModule',
        entityId: id,
        actionPerformed: 'Deleted custom module and associated schema/records',
        userName: user.email || user.name || 'Administrator',
        userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
        modifiedFields: {
          deletedModuleName: existing.name
        }
      },
      tx
    );

    return { success: true, message: `Custom module "${existing.name}" deleted successfully` };
  });
}

// ===========================================================================
// Form Schemas Service
// ===========================================================================

export async function getFormSchema(schoolId, moduleKey) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  if (!moduleKey) throw new ValidationError('moduleKey is required');

  const schema = await customModulesRepo.findSchemaByModuleKey(schoolId, moduleKey);
  if (schema) {
    let sections = schema.sections;
    if (sections && !Array.isArray(sections) && Array.isArray(sections.fields)) {
      sections = [{ id: 'default', title: 'Custom Details', fields: sections.fields }];
    }
    return {
      id: schema.id,
      moduleKey: schema.moduleKey,
      sections: Array.isArray(sections) ? sections : [],
      updatedAt: schema.updatedAt
    };
  }

  // Fallback for default core schemas if not customized yet
  if (DEFAULT_CORE_SCHEMAS[moduleKey]) {
    return {
      moduleKey,
      sections: DEFAULT_CORE_SCHEMAS[moduleKey].sections,
      isDefault: true
    };
  }

  return {
    moduleKey,
    sections: []
  };
}

export async function upsertFormSchema(schoolId, moduleKey, schemaInput, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  if (!moduleKey) throw new ValidationError('moduleKey is required');

  checkPrototypePollution(schemaInput);

  let normalizedSections = [];
  if (Array.isArray(schemaInput.sections)) {
    normalizedSections = schemaInput.sections;
  } else if (Array.isArray(schemaInput.fields)) {
    normalizedSections = [
      {
        id: 'default',
        title: 'Custom Details',
        fields: schemaInput.fields
      }
    ];
  } else {
    throw new ValidationError('Schema must provide sections or fields array');
  }

  const result = await customModulesRepo.upsertSchema(schoolId, moduleKey, normalizedSections);

  await createAuditLog({
    schoolId,
    entityType: 'CustomFormSchema',
    entityId: result.id,
    actionPerformed: `Updated form schema for module: ${moduleKey}`,
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: {
      moduleKey,
      sectionCount: normalizedSections.length
    }
  });

  return {
    id: result.id,
    moduleKey: result.moduleKey,
    sections: result.sections,
    updatedAt: result.updatedAt
  };
}

export async function deleteFormSchema(schoolId, moduleKey, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  if (!moduleKey) throw new ValidationError('moduleKey is required');

  await customModulesRepo.deleteSchema(schoolId, moduleKey);

  await createAuditLog({
    schoolId,
    entityType: 'CustomFormSchema',
    entityId: moduleKey,
    actionPerformed: `Deleted form schema for module: ${moduleKey}`,
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: { moduleKey }
  });

  return { success: true, message: `Form schema for ${moduleKey} deleted` };
}

// ===========================================================================
// Dynamic Module Records Service
// ===========================================================================

export function validateRecordAgainstSchema(schemaSections, recordData) {
  if (!recordData || typeof recordData !== 'object') {
    throw new ValidationError('Record data must be an object');
  }

  checkPrototypePollution(recordData);

  const schemaFieldsMap = new Map();
  if (Array.isArray(schemaSections)) {
    for (const section of schemaSections) {
      if (Array.isArray(section.fields)) {
        for (const field of section.fields) {
          if (field.id) {
            schemaFieldsMap.set(field.id, field);
          }
        }
      }
    }
  }

  // 1. Reject unknown field keys
  for (const key of Object.keys(recordData)) {
    if (!schemaFieldsMap.has(key)) {
      throw new ValidationError(`Unknown field key: "${key}" is not defined in the active schema`);
    }
  }

  // 2. Validate field values
  for (const [fieldId, field] of schemaFieldsMap.entries()) {
    const value = recordData[fieldId];
    const isMissingOrEmpty = value === undefined || value === null || value === '';

    // Required check
    if (field.required) {
      if (field.type === 'checkbox') {
        if (value === undefined || value === null) {
          throw new ValidationError(`Required field "${field.label}" (${fieldId}) must be specified`);
        }
      } else if (isMissingOrEmpty) {
        throw new ValidationError(`Required field "${field.label}" (${fieldId}) cannot be empty`);
      }
    }

    // Type validation if present
    if (!isMissingOrEmpty) {
      switch (field.type) {
        case 'number':
          if (typeof value !== 'number' && isNaN(Number(value))) {
            throw new ValidationError(`Field "${field.label}" must be a valid number`);
          }
          break;

        case 'email':
          if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new ValidationError(`Field "${field.label}" must be a valid email address`);
          }
          break;

        case 'date':
          if (typeof value !== 'string' || isNaN(Date.parse(value))) {
            throw new ValidationError(`Field "${field.label}" must be a valid date string`);
          }
          break;

        case 'select':
          if (typeof value !== 'string') {
            throw new ValidationError(`Field "${field.label}" must be a string`);
          }
          if (field.options) {
            const allowedOptions = field.options.split(',').map((o) => o.trim()).filter(Boolean);
            if (allowedOptions.length > 0 && !allowedOptions.includes(value.trim())) {
              throw new ValidationError(
                `Invalid option "${value}" for field "${field.label}". Allowed: ${allowedOptions.join(', ')}`
              );
            }
          }
          break;

        case 'checkbox':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            throw new ValidationError(`Field "${field.label}" must be a boolean`);
          }
          break;

        case 'file':
          if (typeof value !== 'string') {
            throw new ValidationError(`Field "${field.label}" must be a valid file URL or string path`);
          }
          break;

        case 'relation':
        case 'text':
        default:
          if (typeof value !== 'string' && typeof value !== 'number') {
            throw new ValidationError(`Field "${field.label}" must be a valid text value`);
          }
          break;
      }
    }
  }
}

export async function listModuleRecords(schoolId, moduleId, options = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  await getCustomModuleById(schoolId, moduleId);

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(options.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const { records, total } = await customModulesRepo.findRecords(schoolId, moduleId, { skip, take: limit });

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getModuleRecordById(schoolId, moduleId, recordId) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  await getCustomModuleById(schoolId, moduleId);

  const record = await customModulesRepo.findRecordById(schoolId, moduleId, recordId);
  if (!record) {
    throw new NotFoundError(`Record not found with ID: ${recordId}`);
  }
  return record;
}

export async function createModuleRecord(schoolId, moduleId, recordData, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  const module = await getCustomModuleById(schoolId, moduleId);

  const schema = await getFormSchema(schoolId, moduleId);
  validateRecordAgainstSchema(schema.sections, recordData);

  const newRecord = await customModulesRepo.createRecord(schoolId, moduleId, recordData, user.id || null);

  await createAuditLog({
    schoolId,
    entityType: 'CustomModuleRecord',
    entityId: newRecord.id,
    actionPerformed: `Created record in custom module: ${module.name}`,
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: {
      customModuleId: moduleId,
      recordId: newRecord.id
    }
  });

  return newRecord;
}

export async function updateModuleRecord(schoolId, moduleId, recordId, recordData, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  const module = await getCustomModuleById(schoolId, moduleId);

  const existingRecord = await customModulesRepo.findRecordById(schoolId, moduleId, recordId);
  if (!existingRecord) {
    throw new NotFoundError(`Record not found with ID: ${recordId}`);
  }

  const schema = await getFormSchema(schoolId, moduleId);
  validateRecordAgainstSchema(schema.sections, recordData);

  const updatedRecord = await customModulesRepo.updateRecord(schoolId, moduleId, recordId, recordData);

  await createAuditLog({
    schoolId,
    entityType: 'CustomModuleRecord',
    entityId: recordId,
    actionPerformed: `Updated record in custom module: ${module.name}`,
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: {
      customModuleId: moduleId,
      recordId
    }
  });

  return updatedRecord;
}

export async function deleteModuleRecord(schoolId, moduleId, recordId, user = {}) {
  if (!schoolId) throw new ValidationError('Tenant context required: schoolId is missing');
  const module = await getCustomModuleById(schoolId, moduleId);

  const existingRecord = await customModulesRepo.findRecordById(schoolId, moduleId, recordId);
  if (!existingRecord) {
    throw new NotFoundError(`Record not found with ID: ${recordId}`);
  }

  await customModulesRepo.deleteRecord(schoolId, moduleId, recordId);

  await createAuditLog({
    schoolId,
    entityType: 'CustomModuleRecord',
    entityId: recordId,
    actionPerformed: `Deleted record from custom module: ${module.name}`,
    userName: user.email || user.name || 'Administrator',
    userRole: user.role || user.systemRole || 'SCHOOL_ADMIN',
    modifiedFields: {
      customModuleId: moduleId,
      recordId
    }
  });

  return { success: true, message: 'Record deleted successfully' };
}
