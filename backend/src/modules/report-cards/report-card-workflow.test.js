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
});
