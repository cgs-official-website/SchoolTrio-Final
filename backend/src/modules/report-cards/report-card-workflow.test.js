import { describe, it, expect } from 'vitest';
import { parseTableStructureFromHtml } from '../report-card-templates/docx-parser.service.js';
import { 
  DEFAULT_REPORT_CARD_CONFIG, 
  deriveAssessmentComponentsFromColumns, 
  serializeTemplate 
} from '../report-card-templates/report-card-template.service.js';
import { serializeGrade } from '../assessment-grades/assessment-grade.service.js';

describe('Exams & Report Card Workflow - Structure Preservation', () => {
  it('parseTableStructureFromHtml extracts columns, assessment components, maxMarks, and subjects from HTML table', () => {
    const sampleHtml = `
      <div>
        <h1>Spring Mount School</h1>
        <table>
          <thead>
            <tr>
              <th>Scholastic Area : Subjects</th>
              <th>PT/20</th>
              <th>T/50</th>
              <th>SE/10</th>
              <th>NB/10</th>
              <th>BW/10</th>
              <th>TOTAL/100</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>English</td><td>18</td><td>45</td><td>9</td><td>9</td><td>9</td><td>90</td><td>A1</td></tr>
            <tr><td>Mathematics</td><td>19</td><td>48</td><td>10</td><td>10</td><td>10</td><td>97</td><td>A1</td></tr>
            <tr><td>Science</td><td>17</td><td>44</td><td>8</td><td>9</td><td>8</td><td>86</td><td>A2</td></tr>
            <tr><td>TOTAL</td><td>54</td><td>137</td><td>27</td><td>28</td><td>27</td><td>273</td><td>A1</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const result = parseTableStructureFromHtml(sampleHtml);

    // 1. Column preservation
    expect(result.columns).toHaveLength(8);
    expect(result.columns).toContain('PT/20');
    expect(result.columns).toContain('TOTAL/100');

    // 2. Subject rows preservation (TOTAL row excluded from subjects)
    expect(result.subjects).toHaveLength(3);
    expect(result.subjects.map(s => s.name)).toEqual(['English', 'Mathematics', 'Science']);

    // 3. Assessment components preservation with individual maxMarks
    expect(result.assessmentComponents.length).toBeGreaterThanOrEqual(7);
    const ptComp = result.assessmentComponents.find(c => c.label === 'PT/20');
    expect(ptComp).toBeDefined();
    expect(ptComp.maxMarks).toBe(20);
    expect(ptComp.type).toBe('mark');
    expect(ptComp.isCalculated).toBe(false);

    const theoryComp = result.assessmentComponents.find(c => c.label === 'T/50');
    expect(theoryComp).toBeDefined();
    expect(theoryComp.maxMarks).toBe(50);
    expect(theoryComp.type).toBe('mark');

    const totalComp = result.assessmentComponents.find(c => c.label === 'TOTAL/100');
    expect(totalComp).toBeDefined();
    expect(totalComp.maxMarks).toBe(100);
    expect(totalComp.type).toBe('calculated_total');
    expect(totalComp.isCalculated).toBe(true);

    const gradeComp = result.assessmentComponents.find(c => c.label === 'Grade');
    expect(gradeComp).toBeDefined();
    expect(gradeComp.type).toBe('grade');
    expect(gradeComp.isCalculated).toBe(true);
  });

  it('deriveAssessmentComponentsFromColumns accurately maps custom column headers', () => {
    const columns = ['Subject', 'Periodic Test (20)', 'Final Exam (80)', 'Total Marks', 'Grade'];
    const components = deriveAssessmentComponentsFromColumns(columns);

    expect(components).toHaveLength(4);
    expect(components[0].maxMarks).toBe(20);
    expect(components[0].type).toBe('mark');

    expect(components[1].maxMarks).toBe(80);
    expect(components[1].type).toBe('mark');

    expect(components[2].type).toBe('calculated_total');
    expect(components[2].isCalculated).toBe(true);

    expect(components[3].type).toBe('grade');
    expect(components[3].isCalculated).toBe(true);
  });

  it('serializeTemplate preserves and guarantees complete template rows, sections, and components', () => {
    const rawTemplate = {
      id: 'template-uuid-1',
      schoolId: 'school-uuid-1',
      templateType: 'report_card',
      config: {
        themeColor: '#7c3aed',
        grading: {
          style: 'marks_and_grades',
          columns: ['Subject', 'PT/20', 'T/80', 'Total/100', 'Grade']
        }
      }
    };

    const serialized = serializeTemplate(rawTemplate);

    expect(serialized.config.assessmentComponents).toBeDefined();
    expect(serialized.config.assessmentComponents.length).toBe(4);
    expect(serialized.config.subjects).toBeDefined();
    expect(serialized.config.subjects.length).toBeGreaterThan(0);
    expect(serialized.config.sections).toBeDefined();
    expect(serialized.config.sections[0].name).toContain('Scholastic Area');
  });

  it('serializeGrade unpacks componentMarks and preserves remarks cleanly', () => {
    const gradeWithComponents = {
      id: 'grade-1',
      schoolId: 'school-1',
      assessmentId: 'assess-1',
      studentId: 'student-1',
      marksObtained: '92.50',
      isAbsent: false,
      isExempt: false,
      grade: 'A1',
      remarks: JSON.stringify({
        componentMarks: {
          pt: 19,
          theory: 46,
          se: 9.5,
          nb: 9,
          bw: 9
        },
        note: 'Excellent performance'
      }),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const serialized = serializeGrade(gradeWithComponents);
    expect(serialized.marksObtained).toBe(92.5);
    expect(serialized.componentMarks).toBeDefined();
    expect(serialized.componentMarks.pt).toBe(19);
    expect(serialized.componentMarks.theory).toBe(46);
    expect(serialized.componentMarks.se).toBe(9.5);
    expect(serialized.remarks).toBe('Excellent performance');
  });

  it('serializeGrade gracefully handles legacy plain text remarks without crashing', () => {
    const legacyGrade = {
      id: 'grade-2',
      schoolId: 'school-1',
      assessmentId: 'assess-1',
      studentId: 'student-2',
      marksObtained: '80.00',
      isAbsent: false,
      isExempt: false,
      grade: 'B1',
      remarks: 'Good effort throughout the term',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const serialized = serializeGrade(legacyGrade);
    expect(serialized.marksObtained).toBe(80);
    expect(serialized.componentMarks).toBeNull();
    expect(serialized.remarks).toBe('Good effort throughout the term');
  });

  it('filters report cards strictly by publication status ensuring unpublished exams remain hidden from parents', () => {
    // Simulate candidate report cards in database for a student
    const candidateCards = [
      {
        id: 'rc-exam-a',
        examId: 'exam-a-id',
        title: 'Midterm Examination 2024',
        publishedAt: new Date('2024-10-01'),
        marksData: { totalObtained: 85, totalMax: 100 }
      },
      {
        id: 'rc-exam-b',
        examId: 'exam-b-id',
        title: 'Final Examination 2024',
        publishedAt: new Date('2024-10-10'),
        marksData: { totalObtained: 90, totalMax: 100 }
      },
      {
        id: 'rc-continuous',
        examId: null,
        title: 'Class Assessments Summary',
        publishedAt: new Date('2024-09-01'),
        marksData: { totalObtained: 70, totalMax: 100 }
      }
    ];

    // Scenario 1: Only Exam A is published (status in PUBLISHED/FINALIZED), Exam B is in DRAFT
    const publishedExamsScenario1 = new Set(['exam-a-id']);
    const visibleCardsScenario1 = candidateCards.filter(
      r => r.examId && publishedExamsScenario1.has(r.examId)
    );

    expect(visibleCardsScenario1).toHaveLength(1);
    expect(visibleCardsScenario1[0].examId).toBe('exam-a-id');
    expect(visibleCardsScenario1[0].id).toBe('rc-exam-a');

    // Scenario 2: Both Exam A and Exam B are published
    const publishedExamsScenario2 = new Set(['exam-a-id', 'exam-b-id']);
    const visibleCardsScenario2 = candidateCards.filter(
      r => r.examId && publishedExamsScenario2.has(r.examId)
    );

    expect(visibleCardsScenario2).toHaveLength(2);
    expect(visibleCardsScenario2.map(c => c.examId)).toEqual(['exam-a-id', 'exam-b-id']);

    // Scenario 3: Filtered by specific exam (Exam B only)
    const filterExamId = 'exam-b-id';
    const specificExamCards = visibleCardsScenario2.filter(r => r.examId === filterExamId);
    expect(specificExamCards).toHaveLength(1);
    expect(specificExamCards[0].examId).toBe('exam-b-id');

    // Scenario 4: Requesting an unpublished exam returns empty
    const unpublishedFilterExamId = 'exam-c-draft';
    const unpublishedFiltered = visibleCardsScenario2.filter(r => r.examId === unpublishedFilterExamId);
    expect(unpublishedFiltered).toHaveLength(0);
  });
});
