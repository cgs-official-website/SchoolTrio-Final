import * as admissionsRepository from './admissions.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';

/**
 * Admissions & Lead Management Service Layer
 *
 * Enforces:
 * - Strict multi-tenant boundaries (schoolId)
 * - Dynamic form schema validation for public leads
 * - Rate-limited, safe public inquiry and application submission
 * - Application lifecycle (Pending -> Approved / Rejected)
 * - Atomic transactional enrollment into permanent Student directory with seat limit and uniqueness checks
 * - Canonical non-blocking AuditLog generation
 */

// =========================================================================
// 1. ADMISSION LEADS (CRM / Inquiries)
// =========================================================================

/**
 * Lists leads with pagination, search, and filtering.
 */
export async function listLeads(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list admission leads');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'submittedAt',
    defaultOrder: 'desc'
  });

  const options = {
    status: query.status || undefined,
    formId: query.formId || undefined,
    search: query.search ? query.search.trim() : undefined,
    startDate: query.startDate || undefined,
    endDate: query.endDate || undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [leads, total] = await Promise.all([
    admissionsRepository.findLeads(schoolId, options),
    admissionsRepository.countLeads(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { leads, pagination };
}

/**
 * Retrieves a single lead by ID within a tenant.
 */
export async function getLeadById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve admission lead');
  }

  const lead = await admissionsRepository.findLeadById(schoolId, id);
  if (!lead) {
    throw new NotFoundError('Admission lead');
  }

  return lead;
}

/**
 * Updates a lead's status (Cold, Warm, Hot, Contacted, Enrolled, etc.).
 */
export async function updateLeadStatus(schoolId, id, status, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update admission lead status');
  }

  const existing = await admissionsRepository.findLeadById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Admission lead');
  }

  const updated = await admissionsRepository.updateLeadStatus(schoolId, id, status);

  await createAuditLog({
    schoolId,
    entityType: 'AdmissionLead',
    entityId: updated.id,
    actionPerformed: `UPDATE_LEAD_STATUS: ${existing.status} -> ${status}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      previousStatus: existing.status,
      newStatus: status
    }
  });

  return updated;
}

/**
 * Deletes an admission lead.
 */
export async function deleteLead(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete admission lead');
  }

  const existing = await admissionsRepository.findLeadById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Admission lead');
  }

  await admissionsRepository.deleteLead(schoolId, id);

  await createAuditLog({
    schoolId,
    entityType: 'AdmissionLead',
    entityId: id,
    actionPerformed: `DELETE_LEAD: ${existing.name || existing.id}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedLeadId: id,
      leadName: existing.name
    }
  });

  return { id };
}

// =========================================================================
// 2. LEAD FORMS (Dynamic Form Builder)
// =========================================================================

/**
 * Lists lead forms configured for a tenant.
 */
export async function listLeadForms(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list lead forms');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const options = {
    isActive: query.isActive !== undefined ? query.isActive === 'true' : undefined,
    search: query.search ? query.search.trim() : undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [forms, total] = await Promise.all([
    admissionsRepository.findLeadForms(schoolId, options),
    admissionsRepository.countLeadForms(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { forms, pagination };
}

/**
 * Retrieves a single lead form by ID within a tenant.
 */
export async function getLeadFormById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve lead form');
  }

  const form = await admissionsRepository.findLeadFormById(schoolId, id);
  if (!form) {
    throw new NotFoundError('Lead form');
  }

  return form;
}

/**
 * Creates a new lead form configuration.
 */
export async function createLeadForm(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create lead form');
  }

  const created = await admissionsRepository.createLeadForm({
    schoolId,
    title: data.title.trim(),
    description: data.description ? data.description.trim() : null,
    fields: {
      successMessage: data.successMessage || 'Thank you! Your enquiry has been received.',
      fieldList: data.fields
    },
    isActive: data.isActive !== undefined ? data.isActive : true
  });

  await createAuditLog({
    schoolId,
    entityType: 'LeadForm',
    entityId: created.id,
    actionPerformed: `CREATE_LEAD_FORM: ${created.title}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      title: created.title,
      fieldCount: Array.isArray(data.fields) ? data.fields.length : 0
    }
  });

  return created;
}

/**
 * Updates an existing lead form configuration.
 */
export async function updateLeadForm(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update lead form');
  }

  const existing = await admissionsRepository.findLeadFormById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Lead form');
  }

  const updatePayload = {};
  if (data.title !== undefined) updatePayload.title = data.title.trim();
  if (data.description !== undefined) updatePayload.description = data.description ? data.description.trim() : null;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

  if (data.fields !== undefined || data.successMessage !== undefined) {
    const existingFieldsObj = (existing.fields && typeof existing.fields === 'object') ? existing.fields : {};
    updatePayload.fields = {
      successMessage: data.successMessage !== undefined ? data.successMessage : (existingFieldsObj.successMessage || ''),
      fieldList: data.fields !== undefined ? data.fields : (existingFieldsObj.fieldList || existing.fields || [])
    };
  }

  const updated = await admissionsRepository.updateLeadForm(schoolId, id, updatePayload);

  await createAuditLog({
    schoolId,
    entityType: 'LeadForm',
    entityId: updated.id,
    actionPerformed: `UPDATE_LEAD_FORM: ${updated.title}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: updatePayload
  });

  return updated;
}

/**
 * Deletes a lead form configuration.
 */
export async function deleteLeadForm(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete lead form');
  }

  const existing = await admissionsRepository.findLeadFormById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Lead form');
  }

  await admissionsRepository.deleteLeadForm(schoolId, id);

  await createAuditLog({
    schoolId,
    entityType: 'LeadForm',
    entityId: id,
    actionPerformed: `DELETE_LEAD_FORM: ${existing.title}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedFormId: id,
      title: existing.title
    }
  });

  return { id };
}

// =========================================================================
// 3. PUBLIC PORTAL ENDPOINTS (Inquiries & Public Admissions)
// =========================================================================

/**
 * Retrieves public metadata for school admission page (school name, logo, active classes).
 */
export async function getPublicSchoolAdmissionMeta(schoolId) {
  const school = await admissionsRepository.findSchoolPublicMeta(schoolId);
  if (!school) {
    throw new NotFoundError('School not found or admission portal is currently inactive');
  }

  return {
    id: school.id,
    schoolName: school.name,
    code: school.code,
    type: school.type,
    logoUrl: school.logoUrl,
    address: school.address,
    email: school.email,
    phone: school.phone,
    classes: school.classes.map(c => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      sections: c.sections.map(s => ({ id: s.id, name: s.name }))
    }))
  };
}

/**
 * Retrieves public schema for an active lead form.
 */
export async function getPublicLeadForm(schoolId, formId) {
  const form = await admissionsRepository.findPublicLeadForm(schoolId, formId);
  if (!form) {
    throw new NotFoundError('Lead inquiry form not found or has been disabled');
  }

  const fieldsObj = (form.fields && typeof form.fields === 'object') ? form.fields : {};
  const fieldList = Array.isArray(fieldsObj.fieldList) ? fieldsObj.fieldList : (Array.isArray(form.fields) ? form.fields : []);
  const successMessage = fieldsObj.successMessage || 'Your enquiry has been successfully submitted. We will get back to you shortly.';

  return {
    id: form.id,
    schoolId: form.schoolId,
    title: form.title,
    description: form.description,
    successMessage,
    fields: fieldList,
    school: {
      id: form.school?.id,
      name: form.school?.name,
      logoUrl: form.school?.logoUrl
    }
  };
}

/**
 * Submits a public lead inquiry.
 * Validates submitted data against the stored dynamic form schema.
 */
export async function submitPublicLead(schoolId, formId, submissionData) {
  const form = await admissionsRepository.findPublicLeadForm(schoolId, formId);
  if (!form) {
    throw new NotFoundError('Form not found or has been disabled');
  }

  const rawData = submissionData.data || {};
  const fieldsObj = (form.fields && typeof form.fields === 'object') ? form.fields : {};
  const fieldList = Array.isArray(fieldsObj.fieldList) ? fieldsObj.fieldList : (Array.isArray(form.fields) ? form.fields : []);

  // 1. Server-side validation against dynamic form field requirements
  const missingFields = [];
  for (const field of fieldList) {
    if (field.required) {
      const val = rawData[field.id];
      if (field.type === 'checkbox') {
        if (!Array.isArray(val) || val.length === 0) {
          missingFields.push(field.label || field.id);
        }
      } else {
        if (val === undefined || val === null || String(val).trim() === '') {
          missingFields.push(field.label || field.id);
        }
      }
    }
  }

  if (missingFields.length > 0) {
    throw new ValidationError(`Please provide required fields: ${missingFields.join(', ')}`);
  }

  // 2. Extract standard lead fields from form responses if available
  let leadName = 'Prospective Student';
  let leadPhone = null;
  let leadEmail = null;
  let gradeInterested = null;

  for (const field of fieldList) {
    const val = rawData[field.id];
    if (!val) continue;

    const lbl = (field.label || '').toLowerCase();
    if (lbl.includes('name') && !leadName.includes(' ') && typeof val === 'string') {
      leadName = val.trim();
    }
    if ((lbl.includes('phone') || lbl.includes('mobile') || field.type === 'phone') && !leadPhone && typeof val === 'string') {
      leadPhone = val.trim();
    }
    if ((lbl.includes('email') || field.type === 'email') && !leadEmail && typeof val === 'string') {
      leadEmail = val.trim();
    }
    if ((lbl.includes('grade') || lbl.includes('class')) && !gradeInterested && typeof val === 'string') {
      gradeInterested = val.trim();
    }
  }

  // 3. Persist lead in database
  const created = await admissionsRepository.createLead({
    schoolId,
    name: leadName.slice(0, 150),
    phone: leadPhone ? leadPhone.slice(0, 20) : null,
    email: leadEmail ? leadEmail.slice(0, 255) : null,
    gradeInterested: gradeInterested ? gradeInterested.slice(0, 50) : null,
    status: 'Cold', // Initial default lead status
    customData: {
      formId,
      formTitle: form.title,
      data: rawData
    }
  });

  return {
    id: created.id,
    formId,
    status: created.status,
    submittedAt: created.submittedAt
  };
}

/**
 * Submits a public admission application.
 */
export async function submitPublicAdmission(schoolId, data) {
  // 1. Verify school status
  const school = await prisma.school.findFirst({
    where: {
      id: schoolId,
      status: 'approved'
    }
  });
  if (!school) {
    throw new NotFoundError('School not found or not currently accepting online admission applications');
  }

  // 2. Verify target class belongs to school if provided
  if (data.classId) {
    const classEntity = await prisma.class.findFirst({
      where: {
        id: data.classId,
        schoolId
      }
    });
    if (!classEntity) {
      throw new ValidationError('Selected class does not exist in this institution');
    }
  }

  // 3. Generate structured application reference number (e.g. ADM-2026-8421)
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const applicationNumber = `ADM-${year}-${randomSuffix}`;

  const firstName = data.firstName.trim();
  const lastName = data.lastName ? data.lastName.trim() : '';
  const fullName = data.studentName?.trim() || `${firstName} ${lastName}`.trim();

  // 4. Combine residential address fields if structured
  let fullAddress = data.address?.trim() || data.homeAddress?.trim() || '';
  if (data.city || data.state || data.pincode) {
    const parts = [fullAddress, data.city, data.state, data.pincode].filter(Boolean);
    fullAddress = parts.join(', ');
  }

  const created = await admissionsRepository.createApplication({
    schoolId,
    classId: data.classId || null,
    studentName: fullName,
    dob: data.dob,
    gender: data.gender || 'Male',
    parentName: data.parentName.trim(),
    parentPhone: data.parentPhone.trim(),
    parentEmail: data.parentEmail ? data.parentEmail.trim() : null,
    address: fullAddress || null,
    photoUrl: data.photoUrl ? data.photoUrl.trim() : null,
    status: 'Pending'
  });

  return {
    id: created.id,
    applicationNumber,
    studentName: created.studentName,
    status: created.status,
    submittedAt: created.submittedAt
  };
}

// =========================================================================
// 4. ADMISSION APPLICATIONS ADMIN API
// =========================================================================

/**
 * Lists admission applications for a tenant.
 */
export async function listApplications(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list admission applications');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'submittedAt',
    defaultOrder: 'desc'
  });

  const options = {
    status: query.status || undefined,
    classId: query.classId || undefined,
    search: query.search ? query.search.trim() : undefined,
    startDate: query.startDate || undefined,
    endDate: query.endDate || undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [applications, total] = await Promise.all([
    admissionsRepository.findApplications(schoolId, options),
    admissionsRepository.countApplications(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { applications, pagination };
}

/**
 * Retrieves a single admission application by ID within a tenant.
 */
export async function getApplicationById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve admission application');
  }

  const application = await admissionsRepository.findApplicationById(schoolId, id);
  if (!application) {
    throw new NotFoundError('Admission application');
  }

  return application;
}

/**
 * Updates application status (Approved or Rejected).
 */
export async function updateApplicationStatus(schoolId, id, status, remarks = null, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update admission application status');
  }

  const existing = await admissionsRepository.findApplicationById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Admission application');
  }

  const updated = await admissionsRepository.updateApplicationStatus(schoolId, id, status);

  await createAuditLog({
    schoolId,
    entityType: 'AdmissionApplication',
    entityId: updated.id,
    actionPerformed: `UPDATE_APPLICATION_STATUS: ${existing.status} -> ${status}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      previousStatus: existing.status,
      newStatus: status,
      remarks
    }
  });

  return updated;
}

/**
 * Deletes an admission application.
 */
export async function deleteApplication(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete admission application');
  }

  const existing = await admissionsRepository.findApplicationById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Admission application');
  }

  await admissionsRepository.deleteApplication(schoolId, id);

  await createAuditLog({
    schoolId,
    entityType: 'AdmissionApplication',
    entityId: id,
    actionPerformed: `DELETE_APPLICATION: ${existing.studentName}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedApplicationId: id,
      studentName: existing.studentName
    }
  });

  return { id };
}

/**
 * Enrolls an admission application into the permanent Student directory.
 * Transactional:
 * 1. Checks application exists and is not already enrolled.
 * 2. Checks school student seat limit.
 * 3. Checks admissionNumber uniqueness.
 * 4. Validates classId and optional sectionId.
 * 5. Creates Student record and marks AdmissionApplication as Approved atomically.
 */
export async function enrollApplication(schoolId, id, enrollmentData, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to enroll application');
  }

  const admissionNumber = enrollmentData.admissionNumber.trim();

  // Execute in an interactive transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch application with lock
    const app = await tx.admissionApplication.findFirst({
      where: {
        id,
        schoolId
      }
    });

    if (!app) {
      throw new NotFoundError('Admission application');
    }

    // 2. Check if student already enrolled from this application
    const existingStudentFromApp = await tx.student.findFirst({
      where: {
        schoolId,
        customData: {
          path: ['admittedFromApplicationId'],
          equals: app.id
        }
      }
    });

    if (existingStudentFromApp) {
      throw new ConflictError(`This application has already been enrolled as student (Admission Number: ${existingStudentFromApp.admissionNumber})`);
    }

    // 3. Authoritative Seat Limit Check
    const school = await tx.school.findFirst({
      where: { id: schoolId },
      select: { seatLimit: true, plan: { select: { userLimit: true } } }
    });

    const effectiveSeatLimit = school?.seatLimit || school?.plan?.userLimit || 500;
    const currentStudentCount = await tx.student.count({ where: { schoolId } });

    if (currentStudentCount >= effectiveSeatLimit) {
      throw new ValidationError(
        `School student capacity limit of ${effectiveSeatLimit} seats reached. Cannot admit more students.`
      );
    }

    // 4. Duplicate admission number check
    const existingByAdm = await tx.student.findFirst({
      where: {
        schoolId,
        admissionNumber: {
          equals: admissionNumber,
          mode: 'insensitive'
        }
      }
    });

    if (existingByAdm) {
      throw new ConflictError(`Admission number "${admissionNumber}" is already in use by another student`);
    }

    // 5. Validate classId
    const classEntity = await tx.class.findFirst({
      where: {
        id: enrollmentData.classId,
        schoolId
      }
    });

    if (!classEntity) {
      throw new ValidationError('Target class not found in this institution');
    }

    // 6. Validate sectionId if supplied
    if (enrollmentData.sectionId) {
      const sectionEntity = await tx.section.findFirst({
        where: {
          id: enrollmentData.sectionId,
          classId: enrollmentData.classId,
          schoolId
        }
      });
      if (!sectionEntity) {
        throw new ValidationError('Selected section does not belong to the target class in this institution');
      }
    }

    // 7. Parse first and last names
    const nameParts = (app.studentName || 'Student').trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // 8. Create permanent Student record
    const newStudent = await tx.student.create({
      data: {
        schoolId,
        admissionNumber,
        firstName,
        lastName,
        dob: app.dob || null,
        gender: app.gender || 'Male',
        photoUrl: app.photoUrl || null,
        rollNumber: enrollmentData.rollNumber ? enrollmentData.rollNumber.trim() : null,
        classId: enrollmentData.classId,
        sectionId: enrollmentData.sectionId || null,
        status: 'Active',
        customData: {
          parentName: app.parentName,
          parentPhone: app.parentPhone,
          parentEmail: app.parentEmail,
          homeAddress: app.address,
          admittedFromApplicationId: app.id
        }
      }
    });

    // 9. Mark AdmissionApplication as Approved
    const updatedApp = await tx.admissionApplication.update({
      where: {
        schoolId_id: {
          schoolId,
          id
        }
      },
      data: {
        status: 'Approved'
      }
    });

    // 10. Canonical AuditLog integration
    await createAuditLog(
      {
        schoolId,
        entityType: 'AdmissionApplication',
        entityId: app.id,
        actionPerformed: `ENROLL_APPLICATION: Enrolled as Student ${newStudent.admissionNumber} (${newStudent.firstName})`,
        userName: actor?.email || actor?.userId || 'Administrator',
        userRole: actor?.systemRole || null,
        modifiedFields: {
          applicationId: app.id,
          studentId: newStudent.id,
          admissionNumber: newStudent.admissionNumber,
          classId: newStudent.classId,
          sectionId: newStudent.sectionId
        }
      },
      tx
    );

    return {
      student: newStudent,
      application: updatedApp
    };
  });
}
