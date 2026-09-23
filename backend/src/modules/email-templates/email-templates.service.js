import * as emailTemplatesRepo from './email-templates.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/app-error.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Canonical System Default Email Templates
 */
export const DEFAULT_EMAIL_TEMPLATES = Object.freeze({
  welcome: {
    id: 'welcome',
    name: 'Welcome Email',
    description: 'Sent when a new user account is created.',
    subject: 'Welcome to Acme School',
    body: `<h2>Hello {{userName}},</h2>
<p>Your account has been successfully created as a <strong>{{role}}</strong>.</p>
<p>Click the link below to access your dashboard:</p>
<p><a href="{{loginUrl}}" target="_blank">Login to Dashboard</a></p>`,
    variables: ['{{userName}}', '{{role}}', '{{loginUrl}}'],
    isSystem: true,
    isActive: true
  },
  forgotPassword: {
    id: 'forgotPassword',
    name: 'Forgot Password',
    description: 'Sent when a user requests a password reset.',
    subject: 'Password Reset Request',
    body: `<p>We received a request to reset your password.</p>
<p>Click the link below to securely reset your password:</p>
<p><a href="{{resetLink}}" target="_blank">Reset Password</a></p>
<p>This link will expire in 24 hours.</p>`,
    variables: ['{{resetLink}}'],
    isSystem: true,
    isActive: true
  },
  approval: {
    id: 'approval',
    name: 'School Approval',
    description: 'Sent to a School Admin when their registration is approved.',
    subject: 'Your School Account is Approved!',
    body: `<h2>Congratulations, {{schoolName}}!</h2>
<p>Your registration for the School Management System has been approved by the Super Admin.</p>
<p>You can now log in and start configuring your environment.</p>
<p><a href="{{dashboardLink}}" target="_blank">Go to Dashboard</a></p>`,
    variables: ['{{schoolName}}', '{{dashboardLink}}'],
    isSystem: true,
    isActive: true
  }
});

/**
 * Helper to slugify a template name into an identifier.
 */
function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template';
}

/**
 * Load merged templates dictionary for a tenant (combining defaults with saved overrides).
 */
async function getTenantTemplatesMap(schoolId, tx) {
  const setting = await emailTemplatesRepo.findEmailTemplatesSetting(schoolId, tx);
  const savedData = setting?.data && typeof setting.data === 'object' ? setting.data : {};
  const savedTemplates = savedData.templates && typeof savedData.templates === 'object'
    ? savedData.templates
    : {};

  // Build merged map starting with cloned defaults
  const mergedMap = {};
  for (const [key, defaultTpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    mergedMap[key] = {
      ...defaultTpl,
      html: defaultTpl.body,
      createdAt: defaultTpl.createdAt || new Date(0).toISOString(),
      updatedAt: defaultTpl.updatedAt || new Date(0).toISOString()
    };
  }

  // Handle saved templates (or legacy flat fields)
  for (const [key, tpl] of Object.entries(savedTemplates)) {
    if (tpl && typeof tpl === 'object') {
      const isSystem = Boolean(DEFAULT_EMAIL_TEMPLATES[key]);
      mergedMap[key] = {
        ...mergedMap[key],
        ...tpl,
        id: key,
        body: tpl.body || tpl.html || mergedMap[key]?.body || '',
        html: tpl.body || tpl.html || mergedMap[key]?.body || '',
        isSystem,
        isActive: tpl.isActive !== undefined ? Boolean(tpl.isActive) : true
      };
    }
  }

  // Check legacy flat fields if savedTemplates didn't contain them
  if (savedData.welcomeSubject) mergedMap.welcome.subject = savedData.welcomeSubject;
  if (savedData.welcomeHtml) {
    mergedMap.welcome.body = savedData.welcomeHtml;
    mergedMap.welcome.html = savedData.welcomeHtml;
  }
  if (savedData.forgotPasswordSubject) mergedMap.forgotPassword.subject = savedData.forgotPasswordSubject;
  if (savedData.forgotPasswordHtml) {
    mergedMap.forgotPassword.body = savedData.forgotPasswordHtml;
    mergedMap.forgotPassword.html = savedData.forgotPasswordHtml;
  }
  if (savedData.approvalSubject) mergedMap.approval.subject = savedData.approvalSubject;
  if (savedData.approvalHtml) {
    mergedMap.approval.body = savedData.approvalHtml;
    mergedMap.approval.html = savedData.approvalHtml;
  }

  return mergedMap;
}

/**
 * Converts a template map into legacy flat format for backward compatibility.
 */
function buildLegacyFlatFormat(templatesMap) {
  return {
    welcomeSubject: templatesMap.welcome?.subject || DEFAULT_EMAIL_TEMPLATES.welcome.subject,
    welcomeHtml: templatesMap.welcome?.body || DEFAULT_EMAIL_TEMPLATES.welcome.body,
    forgotPasswordSubject: templatesMap.forgotPassword?.subject || DEFAULT_EMAIL_TEMPLATES.forgotPassword.subject,
    forgotPasswordHtml: templatesMap.forgotPassword?.body || DEFAULT_EMAIL_TEMPLATES.forgotPassword.body,
    approvalSubject: templatesMap.approval?.subject || DEFAULT_EMAIL_TEMPLATES.approval.subject,
    approvalHtml: templatesMap.approval?.body || DEFAULT_EMAIL_TEMPLATES.approval.body
  };
}

/**
 * 1. List all templates for a tenant with optional filtering.
 */
export async function listTemplates(schoolId, query = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const templatesMap = await getTenantTemplatesMap(schoolId);
  let templatesList = Object.values(templatesMap);

  // Filter by isActive
  if (query.isActive !== undefined) {
    const activeBool = query.isActive === 'true';
    templatesList = templatesList.filter(t => t.isActive === activeBool);
  }

  // Filter by isSystem
  if (query.isSystem !== undefined) {
    const systemBool = query.isSystem === 'true';
    templatesList = templatesList.filter(t => t.isSystem === systemBool);
  }

  // Filter by search term
  if (query.search) {
    const term = query.search.toLowerCase().trim();
    templatesList = templatesList.filter(t =>
      t.name.toLowerCase().includes(term) ||
      t.id.toLowerCase().includes(term) ||
      t.subject.toLowerCase().includes(term) ||
      (t.description && t.description.toLowerCase().includes(term))
    );
  }

  return {
    templates: templatesList,
    raw: buildLegacyFlatFormat(templatesMap)
  };
}

/**
 * 2. Get a single template by identifier.
 */
export async function getTemplateById(schoolId, templateId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!templateId) {
    throw new ValidationError('Template identifier is required');
  }

  const templatesMap = await getTenantTemplatesMap(schoolId);
  const template = templatesMap[templateId];

  if (!template) {
    throw new NotFoundError(`Email template not found: ${templateId}`);
  }

  return template;
}

/**
 * 3. Create a custom template for a school tenant.
 */
export async function createCustomTemplate(schoolId, payload, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const templateId = payload.id ? slugify(payload.id) : slugify(payload.name);

  // Prohibit shadowing or recreating system templates via create
  if (DEFAULT_EMAIL_TEMPLATES[templateId]) {
    throw new ConflictError(
      `Template ID '${templateId}' is a protected system template. Use update instead.`
    );
  }

  return emailTemplatesRepo.executeTransaction(async (tx) => {
    const templatesMap = await getTenantTemplatesMap(schoolId, tx);

    if (templatesMap[templateId]) {
      throw new ConflictError(`Email template with identifier '${templateId}' already exists`);
    }

    const now = new Date().toISOString();
    const bodyContent = payload.body || payload.html;

    const newTemplate = {
      id: templateId,
      name: payload.name,
      description: payload.description || '',
      subject: payload.subject,
      body: bodyContent,
      html: bodyContent,
      variables: payload.variables || [],
      isSystem: false,
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now
    };

    templatesMap[templateId] = newTemplate;

    await emailTemplatesRepo.upsertEmailTemplatesSetting(
      schoolId,
      {
        templates: templatesMap,
        ...buildLegacyFlatFormat(templatesMap)
      },
      tx
    );

    await createAuditLog(
      {
        schoolId,
        entityType: 'EmailTemplate',
        entityId: templateId,
        actionPerformed: 'CREATE_EMAIL_TEMPLATE',
        userName: actor.email || actor.name || 'Administrator',
        userRole: actor.systemRole || actor.role || SYSTEM_ROLES.SCHOOL_ADMIN,
        modifiedFields: {
          templateId,
          name: newTemplate.name,
          subject: newTemplate.subject
        }
      },
      tx
    );

    return newTemplate;
  });
}

/**
 * 4. Update an existing template (system or custom).
 */
export async function updateTemplate(schoolId, templateId, payload, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!templateId) {
    throw new ValidationError('Template identifier is required');
  }

  return emailTemplatesRepo.executeTransaction(async (tx) => {
    const templatesMap = await getTenantTemplatesMap(schoolId, tx);
    const existing = templatesMap[templateId];

    if (!existing) {
      throw new NotFoundError(`Email template not found: ${templateId}`);
    }

    const now = new Date().toISOString();
    const updatedContent = payload.body !== undefined
      ? payload.body
      : (payload.html !== undefined ? payload.html : existing.body);

    const isSystem = Boolean(DEFAULT_EMAIL_TEMPLATES[templateId]);

    const updatedTemplate = {
      ...existing,
      name: payload.name !== undefined ? payload.name : existing.name,
      description: payload.description !== undefined ? payload.description : existing.description,
      subject: payload.subject !== undefined ? payload.subject : existing.subject,
      body: updatedContent,
      html: updatedContent,
      variables: isSystem ? existing.variables : (payload.variables !== undefined ? payload.variables : existing.variables),
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : existing.isActive,
      isSystem,
      updatedAt: now
    };

    templatesMap[templateId] = updatedTemplate;

    await emailTemplatesRepo.upsertEmailTemplatesSetting(
      schoolId,
      {
        templates: templatesMap,
        ...buildLegacyFlatFormat(templatesMap)
      },
      tx
    );

    await createAuditLog(
      {
        schoolId,
        entityType: 'EmailTemplate',
        entityId: templateId,
        actionPerformed: 'UPDATE_EMAIL_TEMPLATE',
        userName: actor.email || actor.name || 'Administrator',
        userRole: actor.systemRole || actor.role || SYSTEM_ROLES.SCHOOL_ADMIN,
        modifiedFields: {
          templateId,
          updatedKeys: Object.keys(payload)
        }
      },
      tx
    );

    return updatedTemplate;
  });
}

/**
 * 5. Reset a system template back to standard defaults.
 */
export async function resetTemplate(schoolId, templateId, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!templateId) {
    throw new ValidationError('Template identifier is required');
  }

  const defaultTemplate = DEFAULT_EMAIL_TEMPLATES[templateId];
  if (!defaultTemplate) {
    throw new ValidationError(`Template '${templateId}' is not a system template and cannot be reset to defaults`);
  }

  return emailTemplatesRepo.executeTransaction(async (tx) => {
    const templatesMap = await getTenantTemplatesMap(schoolId, tx);

    const now = new Date().toISOString();
    const resetTpl = {
      ...defaultTemplate,
      html: defaultTemplate.body,
      createdAt: templatesMap[templateId]?.createdAt || now,
      updatedAt: now
    };

    templatesMap[templateId] = resetTpl;

    await emailTemplatesRepo.upsertEmailTemplatesSetting(
      schoolId,
      {
        templates: templatesMap,
        ...buildLegacyFlatFormat(templatesMap)
      },
      tx
    );

    await createAuditLog(
      {
        schoolId,
        entityType: 'EmailTemplate',
        entityId: templateId,
        actionPerformed: 'RESET_EMAIL_TEMPLATE',
        userName: actor.email || actor.name || 'Administrator',
        userRole: actor.systemRole || actor.role || SYSTEM_ROLES.SCHOOL_ADMIN,
        modifiedFields: {
          templateId,
          resetToDefault: true
        }
      },
      tx
    );

    return resetTpl;
  });
}

/**
 * 6. Bulk update templates (supporting structured templates array or legacy flat format).
 */
export async function bulkUpdateTemplates(schoolId, payload, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  return emailTemplatesRepo.executeTransaction(async (tx) => {
    const templatesMap = await getTenantTemplatesMap(schoolId, tx);
    const now = new Date().toISOString();

    // 1. Structured updates via payload.templates
    if (Array.isArray(payload.templates) && payload.templates.length > 0) {
      for (const item of payload.templates) {
        const id = item.id;
        const current = templatesMap[id] || {
          id,
          name: item.name || id,
          description: item.description || '',
          variables: item.variables || [],
          isSystem: false,
          createdAt: now
        };

        const updatedContent = item.body !== undefined
          ? item.body
          : (item.html !== undefined ? item.html : current.body || '');

        templatesMap[id] = {
          ...current,
          ...(item.name && { name: item.name }),
          ...(item.description !== undefined && { description: item.description }),
          ...(item.subject && { subject: item.subject }),
          body: updatedContent,
          html: updatedContent,
          ...(item.isActive !== undefined && { isActive: Boolean(item.isActive) }),
          isSystem: Boolean(DEFAULT_EMAIL_TEMPLATES[id]),
          updatedAt: now
        };
      }
    }

    // 2. Legacy flat format updates
    if (payload.welcomeSubject !== undefined) templatesMap.welcome.subject = payload.welcomeSubject;
    if (payload.welcomeHtml !== undefined) {
      templatesMap.welcome.body = payload.welcomeHtml;
      templatesMap.welcome.html = payload.welcomeHtml;
      templatesMap.welcome.updatedAt = now;
    }

    if (payload.forgotPasswordSubject !== undefined) templatesMap.forgotPassword.subject = payload.forgotPasswordSubject;
    if (payload.forgotPasswordHtml !== undefined) {
      templatesMap.forgotPassword.body = payload.forgotPasswordHtml;
      templatesMap.forgotPassword.html = payload.forgotPasswordHtml;
      templatesMap.forgotPassword.updatedAt = now;
    }

    if (payload.approvalSubject !== undefined) templatesMap.approval.subject = payload.approvalSubject;
    if (payload.approvalHtml !== undefined) {
      templatesMap.approval.body = payload.approvalHtml;
      templatesMap.approval.html = payload.approvalHtml;
      templatesMap.approval.updatedAt = now;
    }

    await emailTemplatesRepo.upsertEmailTemplatesSetting(
      schoolId,
      {
        templates: templatesMap,
        ...buildLegacyFlatFormat(templatesMap)
      },
      tx
    );

    await createAuditLog(
      {
        schoolId,
        entityType: 'EmailTemplate',
        entityId: 'bulk',
        actionPerformed: 'UPDATE_EMAIL_TEMPLATES',
        userName: actor.email || actor.name || 'Administrator',
        userRole: actor.systemRole || actor.role || SYSTEM_ROLES.SCHOOL_ADMIN,
        modifiedFields: {
          updatedTemplateIds: Object.keys(templatesMap)
        }
      },
      tx
    );

    return {
      templates: Object.values(templatesMap),
      raw: buildLegacyFlatFormat(templatesMap)
    };
  });
}

/**
 * 7. Delete a custom template. System templates are protected from deletion.
 */
export async function deleteTemplate(schoolId, templateId, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!templateId) {
    throw new ValidationError('Template identifier is required');
  }

  // System templates are protected from deletion
  if (DEFAULT_EMAIL_TEMPLATES[templateId]) {
    throw new ValidationError(
      `System template '${templateId}' is protected and cannot be deleted. You can deactivate or reset it instead.`
    );
  }

  return emailTemplatesRepo.executeTransaction(async (tx) => {
    const templatesMap = await getTenantTemplatesMap(schoolId, tx);

    if (!templatesMap[templateId]) {
      throw new NotFoundError(`Email template not found: ${templateId}`);
    }

    delete templatesMap[templateId];

    await emailTemplatesRepo.upsertEmailTemplatesSetting(
      schoolId,
      {
        templates: templatesMap,
        ...buildLegacyFlatFormat(templatesMap)
      },
      tx
    );

    await createAuditLog(
      {
        schoolId,
        entityType: 'EmailTemplate',
        entityId: templateId,
        actionPerformed: 'DELETE_EMAIL_TEMPLATE',
        userName: actor.email || actor.name || 'Administrator',
        userRole: actor.systemRole || actor.role || SYSTEM_ROLES.SCHOOL_ADMIN,
        modifiedFields: {
          templateId
        }
      },
      tx
    );

    return {
      id: templateId,
      deleted: true
    };
  });
}
