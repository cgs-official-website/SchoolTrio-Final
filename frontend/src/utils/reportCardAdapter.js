/**
 * src/utils/reportCardAdapter.js
 *
 * DTO Adapter module converting backend PostgreSQL ReportCard responses
 * into the legacy UI-compatible object shape expected by existing frontend components.
 *
 * Pure transformer: No side effects, no mutations, no independent recalculations.
 */

/**
 * Normalizes a single backend ReportCard DTO into the legacy UI-compatible shape.
 *
 * @param {Object|null} dto - Raw ReportCard object from backend API or preview
 * @returns {Object|null} Normalized UI report card object
 */
export function adaptReportCard(dto) {
  if (!dto || typeof dto !== 'object') {
    return null;
  }

  // Extract nested or top-level student name
  let studentName = '';
  if (dto.student) {
    studentName = `${dto.student.firstName || ''} ${dto.student.lastName || ''}`.trim();
  } else if (dto.marksData?.studentName) {
    studentName = String(dto.marksData.studentName).trim();
  } else if (dto.studentName) {
    studentName = String(dto.studentName).trim();
  }

  // Extract class name
  const className =
    dto.student?.className ||
    dto.marksData?.className ||
    dto.className ||
    '';

  // Extract class ID
  const classId =
    dto.student?.classId ||
    dto.marksData?.classId ||
    dto.classId ||
    '';

  // Extract student ID
  const studentId =
    dto.studentId ||
    dto.student?.id ||
    dto.marksData?.studentId ||
    '';

  // Extract exam name / title
  const examName =
    dto.title ||
    dto.examName ||
    dto.examination?.name ||
    dto.marksData?.examName ||
    '';

  // Extract marks structure (preserve dictionary/breakdown without alteration)
  const marks = dto.marksData?.marks || dto.marks || {};

  // Extract authoritative grade values (without recalculating)
  const totalObtained =
    dto.grades?.totalObtained ??
    dto.marksData?.totalObtained ??
    dto.totalObtained ??
    0;

  const totalMax =
    dto.grades?.totalMax ??
    dto.grades?.totalMaxMarks ??
    dto.marksData?.totalMax ??
    dto.totalMax ??
    0;

  const percentage =
    dto.grades?.percentage ??
    dto.marksData?.percentage ??
    dto.percentage ??
    0;

  // Extract published metadata
  const publishedAt = dto.publishedAt || null;
  const publishedBy =
    dto.marksData?.publishedBy ||
    dto.publishedBy ||
    '';

  // Extract template snapshot (historical snapshot takes precedence)
  const reportTemplate =
    dto.templateConfigSnapshot ||
    dto.marksData?.reportTemplate ||
    dto.reportTemplate ||
    null;

  // Attendance summary
  const attendanceSummary = dto.attendanceSummary || null;

  return {
    id: dto.id || '',
    examId: dto.examId !== undefined ? dto.examId : null,
    examName,
    classId,
    className,
    studentId,
    studentName,
    marks,
    totalObtained,
    totalMax,
    percentage,
    publishedAt,
    publishedBy,
    reportTemplate,
    attendanceSummary,
    grades: dto.grades || null,
    term: dto.term || null,
    title: dto.title || examName
  };
}

/**
 * Normalizes an array of backend ReportCard DTOs.
 *
 * @param {Array<Object>|null} list - Array of ReportCard objects
 * @returns {Array<Object>} Array of normalized UI report card objects
 */
export function adaptReportCards(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map(item => adaptReportCard(item)).filter(Boolean);
}

/**
 * Normalizes template configuration object ensuring safe access to standard fields.
 *
 * @param {Object|null} config - Raw template config
 * @returns {Object} Normalized template config
 */
export function normalizeReportCardTemplate(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }
  return {
    themeColor: config.themeColor || '#3b82f6',
    header: {
      showLogo: config.header?.showLogo ?? true,
      showAddress: config.header?.showAddress ?? true,
      showPhone: config.header?.showPhone ?? true,
      showEmail: config.header?.showEmail ?? true,
      title: config.header?.title || 'PROGRESS REPORT',
      subtitle: config.header?.subtitle || 'Academic Performance Record'
    },
    studentFields: {
      admissionNo: config.studentFields?.admissionNo ?? true,
      dob: config.studentFields?.dob ?? true,
      fatherName: config.studentFields?.fatherName ?? true,
      motherName: config.studentFields?.motherName ?? true,
      attendance: config.studentFields?.attendance ?? true
    },
    grading: {
      style: config.grading?.style || 'marks_and_grades',
      showTotal: config.grading?.showTotal ?? true,
      showPercentage: config.grading?.showPercentage ?? true,
      showRank: config.grading?.showRank ?? false
    },
    footer: {
      signatures: Array.isArray(config.footer?.signatures)
        ? [...config.footer.signatures]
        : ['Class Teacher', 'Principal', 'Parent'],
      gradingScaleText: config.footer?.gradingScaleText || '',
      remarks: config.footer?.remarks ?? true
    }
  };
}

export default {
  adaptReportCard,
  adaptReportCards,
  normalizeReportCardTemplate
};
