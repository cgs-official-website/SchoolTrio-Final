/**
 * Migration Data Transformers
 * 
 * Modular transformer functions that map raw Firestore documents to
 * target PostgreSQL model structures. Enforces strict read-only guarantees,
 * preserves source values, and tracks data quality flags without mutating data.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const VEHICLE_REG_REGEX = /^[A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4}$/;

export function parseDateSafe(val) {
  if (val === null || val === undefined) return { date: null, isValid: true, raw: null };
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return { date: null, isValid: true, raw: val };

    // Check standard ISO
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return { date: d.toISOString(), isValid: true, raw: val };
    }

    // Check deterministic Indian format: DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
    const ddmmyyyy = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/;
    const match = trimmed.match(ddmmyyyy);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
        return { date: iso, isValid: true, raw: val, isTransformed: true, transformationReason: 'Parsed Indian DD.MM.YYYY format' };
      }
    }

    return { date: null, isValid: false, raw: val };
  }
  if (typeof val === 'object' && val !== null && val._seconds !== undefined) {
    const d = new Date(val._seconds * 1000);
    return { date: d.toISOString(), isValid: true, raw: val };
  }
  return { date: null, isValid: false, raw: String(val) };
}

export function validateEmail(val) {
  if (!val || typeof val !== 'string') return { isValid: true, value: val };
  const trimmed = val.trim();
  const isValid = EMAIL_REGEX.test(trimmed);
  return {
    isValid,
    value: trimmed,
    transformationRequired: !isValid
  };
}

export function validatePhone(val) {
  if (!val || typeof val !== 'string') return { isValid: true, value: val };
  const cleaned = val.replace(/[\s\-+]/g, '');
  const last10 = cleaned.slice(-10);
  const isValid = PHONE_REGEX.test(last10);
  return {
    isValid,
    value: val,
    cleaned: last10,
    transformationRequired: !isValid
  };
}

export function validateVehicleReg(val) {
  if (!val || typeof val !== 'string') return { isValid: true, value: val };
  const trimmed = val.trim().toUpperCase();
  const isValid = VEHICLE_REG_REGEX.test(trimmed);
  return {
    isValid,
    value: val,
    transformationRequired: !isValid
  };
}

export function transformSchool(rawDoc, idMapper) {
  const { id, data } = rawDoc;
  const targetId = idMapper.mapId(null, 'schools', id, 'School', { sourceId: id });

  // Handle studentCount type inconsistency safely
  let studentCount = 0;
  if (data.studentCount !== undefined) {
    studentCount = typeof data.studentCount === 'number' ? data.studentCount : (parseInt(data.studentCount, 10) || 0);
  }

  const createdAtParsed = parseDateSafe(data.createdAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt);

  return {
    targetModel: 'School',
    targetId,
    sourceId: id,
    data: {
      id: targetId,
      name: data.schoolName || data.name || 'Unnamed School',
      code: id,
      studentCount,
      domain: (data.website ? data.website.replace(/^https?:\/\//, '').split('/')[0] : `${id.toLowerCase()}.sms.internal`),
      status: (data.status || 'ACTIVE').toUpperCase(),
      planTier: 'ENTERPRISE', // Default mapped from Phase 3A findings
      settings: {
        branding: data.branding || {},
        academicConfig: data.academicConfig || {},
        customData: data.customData || {},
        staffFormConfig: data.staffFormConfig || {},
        permittedModules: data.permittedModules || []
      },
      createdAt: createdAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    quality: {
      hasInvalidCreatedAt: !createdAtParsed.isValid,
      hasInvalidUpdatedAt: !updatedAtParsed.isValid,
      studentCountRaw: data.studentCount
    }
  };
}

export function transformSubscriptionPlan(rawDoc, idMapper) {
  const { id, data } = rawDoc;
  const targetId = idMapper.mapId(null, 'subscriptionPlans', id, 'SubscriptionPlan');

  let tier = 'STANDARD';
  const nameUpper = (data.name || id).toUpperCase();
  if (nameUpper.includes('ENTERPRISE')) tier = 'ENTERPRISE';
  else if (nameUpper.includes('PREMIUM')) tier = 'PREMIUM';
  else if (nameUpper.includes('BASE') || nameUpper.includes('FREE')) tier = 'FREE';

  return {
    targetModel: 'SubscriptionPlan',
    targetId,
    sourceId: id,
    data: {
      id: targetId,
      name: data.name || id,
      tier,
      pricePerYear: data.pricePerUserPerYear || data.priceYearly || 0,
      maxUsers: data.userLimit || 1000,
      storageLimitGb: data.cloudStorageGB || 10,
      features: data.modules || data.features || []
    }
  };
}

export function transformUser(rawDoc, idMapper, activeSchoolIds) {
  const { id, data } = rawDoc;
  const rawSchoolId = data.schoolId;

  let classification = 'ACTIVE_TENANT_USER';
  let targetSchoolUuid = null;

  if (!rawSchoolId) {
    classification = 'GLOBAL_ADMIN';
  } else if (!activeSchoolIds.has(rawSchoolId)) {
    classification = 'LEGACY_ORPHAN_USER';
  } else {
    targetSchoolUuid = idMapper.getPostgresId(null, 'schools', rawSchoolId);
  }

  const targetId = idMapper.mapId(targetSchoolUuid, 'users', id, 'User', {
    classification,
    rawSchoolId
  });

  const emailCheck = validateEmail(data.email);
  const createdAtParsed = parseDateSafe(data.createdAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt);

  let roleUpper = (data.role || 'GUEST').toUpperCase();
  if (roleUpper === 'SUPERADMIN') roleUpper = 'SUPER_ADMIN';

  return {
    targetModel: 'User',
    targetId,
    sourceId: id,
    classification,
    rawSchoolId,
    targetSchoolUuid,
    data: {
      id: targetId,
      schoolId: targetSchoolUuid,
      email: emailCheck.value,
      role: roleUpper,
      firstName: data.firstName || (data.name ? data.name.split(' ')[0] : 'User'),
      lastName: data.lastName || (data.name && data.name.includes(' ') ? data.name.substring(data.name.indexOf(' ') + 1) : ''),
      status: (data.status || 'ACTIVE').toUpperCase(),
      createdAt: createdAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    quality: {
      emailValid: emailCheck.isValid,
      emailRaw: data.email,
      createdAtValid: createdAtParsed.isValid,
      updatedAtValid: updatedAtParsed.isValid
    }
  };
}

export function transformClass(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const classId = idMapper.mapId(schoolUuid, 'classes', id, 'Class');

  const createdAtParsed = parseDateSafe(data.createdAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt);

  // Normalize sections
  const sections = [];
  if (data.section) {
    const secName = String(data.section).trim();
    const secId = idMapper.mapId(schoolUuid, 'sections', `${id}_${secName}`, 'Section');
    sections.push({
      targetModel: 'Section',
      targetId: secId,
      sourceId: `${id}_${secName}`,
      data: {
        id: secId,
        schoolId: schoolUuid,
        classId,
        name: secName,
        createdAt: createdAtParsed.date
      }
    });
  } else if (Array.isArray(data.sections)) {
    data.sections.forEach((sec, idx) => {
      const secName = typeof sec === 'string' ? sec.trim() : (sec && sec.name ? sec.name.trim() : `Section-${idx + 1}`);
      const secId = idMapper.mapId(schoolUuid, 'sections', `${id}_${secName}`, 'Section');
      sections.push({
        targetModel: 'Section',
        targetId: secId,
        sourceId: `${id}_${secName}`,
        data: {
          id: secId,
          schoolId: schoolUuid,
          classId,
          name: secName,
          createdAt: createdAtParsed.date
        }
      });
    });
  }

  const classRecord = {
    targetModel: 'Class',
    targetId: classId,
    sourceId: id,
    schoolUuid,
    data: {
      id: classId,
      schoolId: schoolUuid,
      name: data.name || 'Unnamed Class',
      createdAt: createdAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    sections
  };

  return classRecord;
}

export function transformStudent(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'students', id, 'Student');

  const dobParsed = parseDateSafe(data.dob);
  const admissionDateParsed = parseDateSafe(data.admissionDate || data.admittedAt || data.createdAt);
  const createdAtParsed = parseDateSafe(data.createdAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt || data.lastUpdatedAt);

  // Validate identifiers
  const emailCheck = validateEmail(data.studentEmail || data.parentEmail);
  const phoneCheck = validatePhone(data.studentPhone || data.parentPhone || data.emergencyContact);

  return {
    targetModel: 'Student',
    targetId,
    sourceId: id,
    schoolUuid,
    rawClassId: data.classId || data.class,
    rawParentId: data.parentId,
    rawRouteId: data.transportRouteId || data.busRoute,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      admissionNumber: data.admissionNumber || `ADM-${id.substring(0, 8)}`,
      firstName: data.firstName || (data.name ? data.name.split(' ')[0] : 'Student'),
      lastName: data.lastName || (data.name && data.name.includes(' ') ? data.name.substring(data.name.indexOf(' ') + 1) : ''),
      gender: (data.gender || 'OTHER').toUpperCase(),
      dateOfBirth: dobParsed.date,
      bloodGroup: data.bloodGroup || null,
      nationalId: data.aadharNumber ? String(data.aadharNumber).replace(/\s/g, '') : null,
      address: {
        homeAddress: data.homeAddress || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null
      },
      customData: data.customData || {},
      status: (data.status || 'ACTIVE').toUpperCase(),
      admissionDate: admissionDateParsed.date,
      createdAt: createdAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    embeddedParent: {
      parentName: data.parentName || data.fatherName || data.motherName || data.guardianName,
      parentPhone: data.parentPhone || data.motherPhone || data.guardianPhone,
      parentEmail: data.parentEmail || data.motherEmail,
      relationship: data.parentRelationship || data.guardianRelationship || 'GUARDIAN'
    },
    quality: {
      emailValid: emailCheck.isValid,
      emailRaw: emailCheck.value,
      phoneValid: phoneCheck.isValid,
      phoneRaw: phoneCheck.value,
      dobValid: dobParsed.isValid,
      admissionDateValid: admissionDateParsed.isValid
    }
  };
}

export function transformStaff(rawDoc, idMapper, schoolId, existingUserUids) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'teachers', id, 'StaffProfile');

  const emailKey = (data.email || '').toLowerCase().trim();
  let matchedUserId = null;

  const isMap = existingUserUids && typeof existingUserUids.get === 'function';
  const isSet = existingUserUids && typeof existingUserUids.has === 'function';

  if (data.userId) {
    if (isMap && existingUserUids.has(data.userId)) {
      matchedUserId = data.userId;
    } else if (isSet && existingUserUids.has(data.userId)) {
      matchedUserId = data.userId;
    }
  }

  if (!matchedUserId && emailKey) {
    if (isMap && existingUserUids.has(emailKey)) {
      const u = existingUserUids.get(emailKey);
      matchedUserId = typeof u === 'string' ? u : (u && u.id ? u.id : emailKey);
    } else if (isSet && existingUserUids.has(emailKey)) {
      matchedUserId = emailKey;
    }
  }

  let userUuid = null;
  let syntheticUserRequired = false;

  if (matchedUserId) {
    userUuid = idMapper.getPostgresId(schoolUuid, 'users', matchedUserId) ||
               idMapper.getPostgresId(null, 'users', matchedUserId) ||
               idMapper.mapId(schoolUuid, 'users', matchedUserId, 'User');
    syntheticUserRequired = false;
  } else {
    syntheticUserRequired = true;
    // Map prospective shadow user
    userUuid = idMapper.mapId(schoolUuid, 'users', `shadow_staff_${id}`, 'User', {
      synthetic: true,
      reason: 'Staff roster entry without auth user'
    });
  }

  const createdAtParsed = parseDateSafe(data.createdAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt || data.lastUpdatedAt);
  const phoneCheck = validatePhone(data.mobileNumber || data.phone);
  const emailCheck = validateEmail(data.email);
  const rawUserId = data.userId || matchedUserId;

  return {
    targetModel: 'StaffProfile',
    targetId,
    sourceId: id,
    schoolUuid,
    userUuid,
    syntheticUserRequired,
    rawUserId,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      userId: userUuid,
      employeeId: data.employeeId || data.staffId || `EMP-${id.substring(0, 8)}`,
      designation: data.role || 'Teacher',
      panNumber: data.panNumber || null,
      aadharNumber: data.aadharNumber || null,
      bankName: data.bankName || null,
      accountNumber: data.bankAccountNumber || data.accountNumber || null,
      ifscCode: data.ifscCode || null,
      qualifications: data.qualifications || data.highestQualification || null,
      createdAt: createdAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    quality: {
      emailValid: emailCheck.isValid,
      phoneValid: phoneCheck.isValid,
      syntheticIdentity: syntheticUserRequired
    }
  };
}

export function transformInvoice(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'invoices', id, 'Invoice');

  const rawStudentId = data.studentId;
  const targetStudentId = idMapper.getPostgresId(schoolUuid, 'students', rawStudentId);

  const dueDateParsed = parseDateSafe(data.dueDate);
  const createdAtParsed = parseDateSafe(data.createdAt);
  const paidAtParsed = parseDateSafe(data.paidAt);
  const updatedAtParsed = parseDateSafe(data.updatedAt);

  return {
    targetModel: 'Invoice',
    targetId,
    sourceId: id,
    schoolUuid,
    rawStudentId,
    targetStudentId,
    isOrphan: !targetStudentId,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      studentId: targetStudentId,
      invoiceNumber: `INV-${id.substring(0, 8).toUpperCase()}`,
      amount: typeof data.amount === 'number' ? data.amount : (parseFloat(data.amount) || 0),
      dueDate: dueDateParsed.date,
      status: (data.status || 'PENDING').toUpperCase(),
      createdAt: createdAtParsed.date,
      paidAt: paidAtParsed.date,
      updatedAt: updatedAtParsed.date
    },
    quality: {
      dueDateValid: dueDateParsed.isValid,
      isOrphan: !targetStudentId
    }
  };
}

export function transformAttendanceSession(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'attendance', id, 'AttendanceSession');

  const rawClassId = data.classId;
  const targetClassId = idMapper.getPostgresId(schoolUuid, 'classes', rawClassId);
  const rawDate = data.date; // e.g. "2026-07-27_FN"

  const dateParts = String(rawDate || '').split('_');
  const dateString = dateParts[0];
  const slot = dateParts[1] || 'FULL_DAY';

  const sessionDateParsed = parseDateSafe(dateString);
  const updatedAtParsed = parseDateSafe(data.updatedAt);

  // Decompose records
  const records = [];
  if (data.records && typeof data.records === 'object') {
    for (const [studentId, statusVal] of Object.entries(data.records)) {
      const targetStudentId = idMapper.getPostgresId(schoolUuid, 'students', studentId);
      const recordKey = `${id}_${studentId}`;
      const recordId = idMapper.mapId(schoolUuid, 'attendance_records', recordKey, 'AttendanceRecord');

      let statusUpper = 'PRESENT';
      if (typeof statusVal === 'string') {
        const s = statusVal.toUpperCase();
        if (s.includes('ABSENT')) statusUpper = 'ABSENT';
        else if (s.includes('LATE')) statusUpper = 'LATE';
      }

      records.push({
        targetModel: 'AttendanceRecord',
        targetId: recordId,
        sourceId: recordKey,
        rawStudentId: studentId,
        targetStudentId,
        isStudentResolved: !!targetStudentId,
        data: {
          id: recordId,
          schoolId: schoolUuid,
          sessionId: targetId,
          studentId: targetStudentId,
          status: statusUpper
        }
      });
    }
  }

  return {
    targetModel: 'AttendanceSession',
    targetId,
    sourceId: id,
    schoolUuid,
    rawClassId,
    targetClassId,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      classId: targetClassId,
      sessionDate: sessionDateParsed.date,
      slot,
      updatedAt: updatedAtParsed.date
    },
    records
  };
}

export function transformFeeStructure(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'feeStructures', id, 'FeeStructure');

  return {
    targetModel: 'FeeStructure',
    targetId,
    sourceId: id,
    schoolUuid,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      name: data.title || data.name || 'Fee Structure',
      code: data.code || data.title || id,
      description: data.description || null,
      amount: typeof data.amount === 'number' ? data.amount : (parseFloat(data.amount) || 0),
      frequency: (data.frequency || 'ANNUAL').toUpperCase(),
      dueDateRule: data.dueDateRule || null,
      customData: data.customData || {},
      createdAt: parseDateSafe(data.createdAt).date,
      updatedAt: parseDateSafe(data.updatedAt).date
    }
  };
}

export function transformSubject(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'subjects', id, 'Subject');

  return {
    targetModel: 'Subject',
    targetId,
    sourceId: id,
    schoolUuid,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      name: data.name || 'Subject',
      code: data.code || data.name || id,
      type: (data.type || 'CORE').toUpperCase(),
      creditHours: typeof data.creditHours === 'number' ? data.creditHours : null,
      createdAt: parseDateSafe(data.createdAt).date,
      updatedAt: parseDateSafe(data.updatedAt).date
    }
  };
}

export function transformTimetable(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'timetables', id, 'TimetablePeriod');
  const targetClassId = idMapper.getPostgresId(schoolUuid, 'classes', data.classId);

  return {
    targetModel: 'TimetablePeriod',
    targetId,
    sourceId: id,
    schoolUuid,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      classId: targetClassId,
      sectionId: null,
      subjectId: null,
      teacherId: null,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      roomNumber: null,
      createdAt: parseDateSafe(data.createdAt).date,
      updatedAt: parseDateSafe(data.updatedAt).date
    },
    rawSchedule: data.schedule || {}
  };
}

export function transformTransportRoute(rawDoc, idMapper, schoolId) {
  const { id, data } = rawDoc;
  const schoolUuid = idMapper.getPostgresId(null, 'schools', schoolId);
  const targetId = idMapper.mapId(schoolUuid, 'transportRoutes', id, 'TransportRoute');

  return {
    targetModel: 'TransportRoute',
    targetId,
    sourceId: id,
    schoolUuid,
    data: {
      id: targetId,
      schoolId: schoolUuid,
      name: data.name || data.vehicleNumber || 'Route',
      vehicleId: null,
      startLocation: data.startLocation || null,
      endLocation: data.endLocation || null,
      pickupTime: data.pickupTime || null,
      dropTime: data.dropTime || null,
      fare: typeof data.fare === 'number' ? data.fare : null,
      customData: {
        vehicleNumber: data.vehicleNumber || null,
        driverName: data.driverName || null,
        driverPhone: data.driverPhone || null,
        capacity: data.capacity || null,
        assignedStudents: data.assignedStudents || [],
        ...(data.customData || {})
      },
      createdAt: parseDateSafe(data.createdAt).date,
      updatedAt: parseDateSafe(data.updatedAt).date
    }
  };
}
