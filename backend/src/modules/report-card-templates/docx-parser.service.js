import mammoth from 'mammoth';
import { generateStructuredJson } from '../../services/openrouter.service.js';
import { ValidationError } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';

/**
 * Extracts text and table structure from Word (.docx) buffer and translates
 * it into a valid SchoolTrio Report Card Template configuration via OpenRouter.
 *
 * @param {Buffer} docxBuffer - Word document binary buffer
 * @returns {Promise<Object>} Formatted report card template configuration
 */
export async function extractTemplateFromDocx(docxBuffer) {
  if (!docxBuffer || !Buffer.isBuffer(docxBuffer)) {
    throw new ValidationError('A valid .docx document buffer is required');
  }

  // 1. Extract raw text and HTML representation
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: docxBuffer }),
    mammoth.convertToHtml({ buffer: docxBuffer })
  ]);

  const rawText = textResult.value || '';
  const htmlContent = htmlResult.value || '';

  if (!rawText.trim() && !htmlContent.trim()) {
    throw new ValidationError('The uploaded Word document appears to be empty or unreadable.');
  }

  // 2. Formulate system prompt for OpenRouter
  const systemPrompt = `You are an expert educational document parser specializing in school report card design.
Your task is to analyze the text and HTML of an uploaded school report card Word document and return a valid JSON object matching the SchoolTrio Report Card Template schema.

IMPORTANT: Return strictly raw JSON. Do NOT include markdown commentary, unquoted keys, or conversational filler. All property keys and strings must be enclosed in double quotes.

Example valid JSON output:
{
  "themeColor": "#3b82f6",
  "header": {
    "showLogo": true,
    "showAddress": true,
    "showPhone": true,
    "showEmail": true,
    "title": "PROGRESS REPORT",
    "subtitle": "Academic Session 2024-2025"
  },
  "studentFields": {
    "admissionNo": true,
    "dob": true,
    "fatherName": true,
    "motherName": true,
    "attendance": true
  },
  "grading": {
    "style": "marks_and_grades",
    "showTotal": true,
    "showPercentage": true,
    "showRank": false,
    "columns": ["Subject", "Max Marks", "Marks Obtained", "Grade"]
  },
  "footer": {
    "signatures": ["Class Teacher", "Principal", "Parent"],
    "gradingScaleText": "A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33",
    "remarks": true
  }
}


Rules:
1. "themeColor": pick a suitable hex color if evident (e.g. #3b82f6 for blue, #7c3aed for purple, #10b981 for green, #c99bc1 for mauve) or default to #3b82f6.
2. "header":
   - "schoolName": Extract the school / institution name if displayed at the very top of the document (e.g. "SPING MOUNT VALLEY SCHOOL").
   - "title": Extract the main report card title found in the doc (e.g. "PROGRESS REPORT", "REPORT CARD", "TERMINAL EXAMINATION RECORD").
   - "subtitle": Extract any session, term, or academic year mention (e.g. "TERMINAL EXAMINATION (2026_27)", "Academic Session 2024-2025" or "Term 1 Evaluation").
   - "showLogo": true if school logo is mentioned or placeholder exists.
   - "showAddress", "showPhone", "showEmail": true if school contact details are present in the header.
3. "studentFields":
   - Set true for any student metadata present in the document: admissionNo, dob (Date of Birth), fatherName, motherName, attendance.
4. "grading":
   - "style": "marks_and_grades" if both numeric scores and grades/letter marks appear; "marks" if only numerical marks; "grades" if purely grade-based.
   - "showTotal": true if total row/aggregate marks exist.
   - "showPercentage": true if percentage (%) or aggregate % is calculated.
   - "showRank": true if student class rank / position is displayed.
   - "columns": Extract the EXACT list of table column headers found in the document marks table (e.g. ["Subject", "PT/20", "T/50", "SE/10", "NB/10", "BW/10", "TOTAL/100"]). Include all column headers in exact order.
5. "footer":
   - "signatures": list all signatory roles found at the bottom (e.g. ["Class Teacher", "Principal", "Parent"] or ["Teacher", "Head of School"]). Max 10 items.
   - "gradingScaleText": if a grading legend/scale is printed (e.g. "A1: 91-100 | B1: 71-80..."), copy or summarize it.
   - "remarks": true if there is a remarks, comments, or observation box for teacher/principal.`;

  const userPrompt = `Here is the extracted content of the uploaded school report card document:

=== DOCUMENT HTML STRUCTURE ===
${htmlContent.substring(0, 12000)}

=== DOCUMENT RAW TEXT ===
${rawText.substring(0, 8000)}

Analyze the structure and return the extracted report card template configuration JSON according to the schema.`;

  logger.info('Sending Word document structure to OpenRouter for template extraction');
  const aiResult = await generateStructuredJson({
    prompt: userPrompt,
    systemPrompt
  });

  // 3. Fallback and normalization to ensure safe schema adherence
  const config = {
    themeColor: aiResult.themeColor || '#3b82f6',
    header: {
      schoolName: aiResult.header?.schoolName || '',
      showLogo: aiResult.header?.showLogo ?? true,
      showAddress: aiResult.header?.showAddress ?? true,
      showPhone: aiResult.header?.showPhone ?? true,
      showEmail: aiResult.header?.showEmail ?? true,
      title: aiResult.header?.title || 'PROGRESS REPORT',
      subtitle: aiResult.header?.subtitle || 'Academic Record'
    },
    studentFields: {
      admissionNo: aiResult.studentFields?.admissionNo ?? true,
      dob: aiResult.studentFields?.dob ?? true,
      fatherName: aiResult.studentFields?.fatherName ?? true,
      motherName: aiResult.studentFields?.motherName ?? true,
      attendance: aiResult.studentFields?.attendance ?? true
    },
    grading: {
      style: ['marks', 'grades', 'marks_and_grades'].includes(aiResult.grading?.style)
        ? aiResult.grading.style
        : 'marks_and_grades',
      showTotal: aiResult.grading?.showTotal ?? true,
      showPercentage: aiResult.grading?.showPercentage ?? true,
      showRank: aiResult.grading?.showRank ?? false,
      columns: Array.isArray(aiResult.grading?.columns) && aiResult.grading.columns.length > 0
        ? aiResult.grading.columns.slice(0, 15)
        : ['Subject', 'Max Marks', 'Marks Obtained', 'Grade']
    },
    footer: {
      signatures: Array.isArray(aiResult.footer?.signatures) && aiResult.footer.signatures.length > 0
        ? aiResult.footer.signatures.slice(0, 8)
        : ['Class Teacher', 'Principal', 'Parent'],
      gradingScaleText: aiResult.footer?.gradingScaleText || 'A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33',
      remarks: aiResult.footer?.remarks ?? true
    }
  };

  return {
    config,
    htmlPreview: htmlContent,
    rawText
  };
}

