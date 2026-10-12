import mammoth from 'mammoth';
import { generateStructuredJson } from '../../services/openrouter.service.js';
import { ValidationError } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';

/**
 * Deterministically parses HTML tables extracted by mammoth to recover
 * table column headers, component maximum marks, and subject rows.
 *
 * @param {string} htmlContent - HTML generated from docx
 * @returns {{ columns: string[], subjects: Array<{ id: string, name: string }>, assessmentComponents: Array<Object>, sections: Array<Object> }}
 */
export function parseTableStructureFromHtml(htmlContent = '') {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return { columns: [], subjects: [], assessmentComponents: [], sections: [] };
  }

  const columns = [];
  const subjects = [];
  const assessmentComponents = [];
  const sections = [];

  // Match all <table>...</table>
  const tableMatches = htmlContent.match(/<table[\s\S]*?<\/table>/gi) || [];

  for (const tableHtml of tableMatches) {
    // Extract rows <tr>...</tr>
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rowMatches.length === 0) continue;

    // Check first row for <th> or <td> headers
    const headerRow = rowMatches[0];
    const cellMatches = headerRow.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];

    const extractedHeaders = cellMatches.map(cell => {
      return cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    }).filter(Boolean);

    if (extractedHeaders.length > 1) {
      // Looks like a valid marks table!
      columns.push(...extractedHeaders);

      // Now extract subject rows from subsequent rows
      for (let r = 1; r < rowMatches.length; r++) {
        const row = rowMatches[r];
        const rowCells = (row.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(cell => {
          return cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        });

        if (rowCells.length > 0 && rowCells[0]) {
          const firstCellText = rowCells[0];
          const lower = firstCellText.toLowerCase();

          // Ignore total, grand total, percentage, signature, or blank rows
          if (
            lower.includes('total') ||
            lower.includes('percentage') ||
            lower.includes('grade') ||
            lower.includes('remark') ||
            lower.includes('attendance') ||
            lower.includes('sign') ||
            lower.includes('scale')
          ) {
            continue;
          }

          const subjectId = firstCellText
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || `sub_${subjects.length + 1}`;

          if (!subjects.some(s => s.name.toLowerCase() === firstCellText.toLowerCase())) {
            subjects.push({
              id: subjectId,
              name: firstCellText
            });
          }
        }
      }

      // If we found a marks table with subjects, we break out
      if (subjects.length > 0) {
        break;
      }
    }
  }

  // Derive assessment components from the columns
  const seenKeys = new Set();
  columns.forEach((col, idx) => {
    const raw = String(col || '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();

    // Skip subject/area header column
    if (idx === 0 && (lower.includes('subject') || lower.includes('scholastic') || lower.includes('area') || lower.includes('name'))) {
      return;
    }

    let baseKey = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `col_${idx}`;

    if (seenKeys.has(baseKey)) {
      baseKey = `${baseKey}_${idx}`;
    }
    seenKeys.add(baseKey);

    let maxMarks = 100;
    const numberMatch = raw.match(/\/(\d+)/) || raw.match(/(\d+)/);
    if (numberMatch && numberMatch[1]) {
      const parsed = parseInt(numberMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 1000) {
        maxMarks = parsed;
      }
    }

    let type = 'mark';
    let isCalculated = false;

    if (lower.includes('grade')) {
      type = 'grade';
      isCalculated = true;
    } else if (lower.includes('total') || lower.includes('overall') || lower.includes('aggregate')) {
      type = 'calculated_total';
      isCalculated = true;
    } else if (lower.includes('max') && !lower.includes('obt')) {
      type = 'max';
      isCalculated = false;
    } else if (lower.includes('remark') || lower.includes('comment')) {
      type = 'remarks';
      isCalculated = false;
    }

    assessmentComponents.push({
      key: baseKey,
      name: raw.replace(/\/\d+/, '').trim() || raw,
      label: raw,
      maxMarks,
      type,
      weightage: maxMarks,
      isCalculated
    });
  });

  if (subjects.length > 0) {
    sections.push({
      id: 'scholastic',
      name: 'Scholastic Area : Subjects',
      subjects: [...subjects]
    });
  }

  return { columns, subjects, assessmentComponents, sections };
}

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
Your task is to analyze the text and HTML of an uploaded school report card Word document and return a valid JSON object matching the complete SchoolTrio Report Card Template schema.

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
    "columns": ["Subject", "PT/20", "T/50", "SE/10", "NB/10", "BW/10", "TOTAL/100", "Grade"]
  },
  "assessmentComponents": [
    { "key": "pt", "name": "PT", "label": "PT/20", "maxMarks": 20, "type": "mark", "weightage": 20, "isCalculated": false },
    { "key": "theory", "name": "Theory", "label": "T/50", "maxMarks": 50, "type": "mark", "weightage": 50, "isCalculated": false },
    { "key": "se", "name": "Subject Enrichment", "label": "SE/10", "maxMarks": 10, "type": "mark", "weightage": 10, "isCalculated": false },
    { "key": "nb", "name": "Notebook", "label": "NB/10", "maxMarks": 10, "type": "mark", "weightage": 10, "isCalculated": false },
    { "key": "bw", "name": "Book Work", "label": "BW/10", "maxMarks": 10, "type": "mark", "weightage": 10, "isCalculated": false },
    { "key": "total", "name": "Total", "label": "TOTAL/100", "maxMarks": 100, "type": "calculated_total", "weightage": 100, "isCalculated": true },
    { "key": "grade", "name": "Grade", "label": "Grade", "maxMarks": 100, "type": "grade", "weightage": 0, "isCalculated": true }
  ],
  "subjects": [
    { "id": "sub_english", "name": "English", "code": "ENG" },
    { "id": "sub_math", "name": "Mathematics", "code": "MATH" },
    { "id": "sub_science", "name": "Science", "code": "SCI" },
    { "id": "sub_social", "name": "Social Studies", "code": "SST" },
    { "id": "sub_computer", "name": "Computer Science", "code": "CS" }
  ],
  "sections": [
    {
      "id": "scholastic",
      "name": "Scholastic Area : Subjects",
      "subjects": [
        { "id": "sub_english", "name": "English", "code": "ENG" },
        { "id": "sub_math", "name": "Mathematics", "code": "MATH" },
        { "id": "sub_science", "name": "Science", "code": "SCI" },
        { "id": "sub_social", "name": "Social Studies", "code": "SST" },
        { "id": "sub_computer", "name": "Computer Science", "code": "CS" }
      ]
    }
  ],
  "footer": {
    "signatures": ["Class Teacher", "Principal", "Parent"],
    "gradingScaleText": "A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33",
    "remarks": true
  }
}

Rules:
1. "themeColor": pick a suitable hex color if evident or default to #3b82f6.
2. "header": extract schoolName, title, subtitle, showLogo, showAddress, showPhone, showEmail.
3. "studentFields": admissionNo, dob, fatherName, motherName, attendance boolean flags.
4. "grading": style, showTotal, showPercentage, showRank, and columns (exact headers in order).
5. "assessmentComponents": Extract each mark-entry, total, or grade column from the marks table!
   - Provide a unique slug key (e.g. "pt", "theory", "se", "total").
   - Extract numeric maxMarks (e.g., from "PT/20" maxMarks is 20; "T/50" is 50; "TOTAL/100" is 100).
   - "type": "mark" for individual components entered by teacher, "calculated_total" for total score column, "grade" for letter grade, "remarks" for remarks.
   - "isCalculated": true for total and grade columns.
6. "subjects": Extract the EXACT subject rows found in the document marks table (e.g. English, Mathematics, Science, etc.). Do not include total rows as subjects.
7. "sections": Group subjects into sections if section headings exist (e.g. "Scholastic Area", "Co-Scholastic"), or create a default "Scholastic Area" section.
8. "footer": signatures, gradingScaleText, remarks.`;

  const userPrompt = `Here is the extracted content of the uploaded school report card document:

=== DOCUMENT HTML STRUCTURE ===
${htmlContent.substring(0, 12000)}

=== DOCUMENT RAW TEXT ===
${rawText.substring(0, 8000)}

Analyze the structure and return the complete extracted report card template configuration JSON according to the schema.`;

  logger.info('Sending Word document structure to OpenRouter for template extraction');
  let aiResult = {};
  try {
    aiResult = await generateStructuredJson({
      prompt: userPrompt,
      systemPrompt
    });
  } catch (aiErr) {
    logger.warn({ msg: 'OpenRouter extraction failed or was unavailable, using deterministic HTML fallback', error: aiErr.message });
    aiResult = {};
  }

  // Deterministic HTML table structure fallback extraction
  const htmlTableStructure = parseTableStructureFromHtml(htmlContent);

  // Merge columns
  const finalColumns = Array.isArray(aiResult.grading?.columns) && aiResult.grading.columns.length > 0
    ? aiResult.grading.columns.slice(0, 20)
    : (htmlTableStructure.columns.length > 0 ? htmlTableStructure.columns : ['Subject', 'Max Marks', 'Marks Obtained', 'Grade']);

  // Merge assessment components
  let finalComponents = [];
  if (Array.isArray(aiResult.assessmentComponents) && aiResult.assessmentComponents.length > 0) {
    finalComponents = aiResult.assessmentComponents.map((c, i) => ({
      key: c.key || `comp_${i}`,
      name: c.name || c.label || `Component ${i + 1}`,
      label: c.label || c.name || `Component ${i + 1}`,
      maxMarks: Number(c.maxMarks) || 100,
      type: c.type || (c.label?.toLowerCase().includes('grade') ? 'grade' : c.label?.toLowerCase().includes('total') ? 'calculated_total' : 'mark'),
      weightage: Number(c.weightage) || Number(c.maxMarks) || 100,
      isCalculated: Boolean(c.isCalculated || c.type === 'calculated_total' || c.type === 'grade')
    }));
  } else if (htmlTableStructure.assessmentComponents.length > 0) {
    finalComponents = htmlTableStructure.assessmentComponents;
  } else {
    // Derive from finalColumns
    const { deriveAssessmentComponentsFromColumns } = await import('./report-card-template.service.js');
    finalComponents = deriveAssessmentComponentsFromColumns(finalColumns);
  }

  // Merge subjects
  let finalSubjects = [];
  if (Array.isArray(aiResult.subjects) && aiResult.subjects.length > 0) {
    finalSubjects = aiResult.subjects.map((s, i) => ({
      id: s.id || `sub_${i + 1}`,
      name: s.name || `Subject ${i + 1}`,
      code: s.code || undefined
    }));
  } else if (htmlTableStructure.subjects.length > 0) {
    finalSubjects = htmlTableStructure.subjects;
  } else {
    finalSubjects = [
      { id: 'sub_english', name: 'English', code: 'ENG' },
      { id: 'sub_math', name: 'Mathematics', code: 'MATH' },
      { id: 'sub_science', name: 'Science', code: 'SCI' },
      { id: 'sub_social', name: 'Social Studies', code: 'SST' },
      { id: 'sub_computer', name: 'Computer Science', code: 'CS' }
    ];
  }

  // Merge sections
  let finalSections = [];
  if (Array.isArray(aiResult.sections) && aiResult.sections.length > 0) {
    finalSections = aiResult.sections.map((sec, i) => ({
      id: sec.id || `sec_${i + 1}`,
      name: sec.name || `Section ${i + 1}`,
      subjects: Array.isArray(sec.subjects) && sec.subjects.length > 0 ? sec.subjects : finalSubjects
    }));
  } else {
    finalSections = [
      {
        id: 'scholastic',
        name: 'Scholastic Area : Subjects',
        subjects: finalSubjects
      }
    ];
  }

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
      columns: finalColumns
    },
    assessmentComponents: finalComponents,
    subjects: finalSubjects,
    sections: finalSections,
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

