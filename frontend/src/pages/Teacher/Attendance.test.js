import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Teacher Attendance Checkbox Selection & Bulk Marking', () => {
  const filePath = path.resolve(__dirname, 'Attendance.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  it('declares selectedStudentIds state and resets selection on date/session/class change', () => {
    expect(fileContent).toContain('const [selectedStudentIds, setSelectedStudentIds] = useState([]);');
    expect(fileContent).toMatch(/useEffect\(\(\) => \{\s*setSelectedStudentIds\(\[\]\);\s*\}, \[selectedDate, selectedSession, classId\]\);/);
  });

  it('implements student selection toggle and select all handlers', () => {
    expect(fileContent).toContain('handleToggleSelectStudent');
    expect(fileContent).toContain('handleToggleSelectAll');
    expect(fileContent).toContain('handleBulkStatusChange');
  });

  it('renders checkbox on the left side of student name in table header and body rows', () => {
    // Header select all checkbox
    expect(fileContent).toContain('aria-label="Select all students"');
    // Student row checkbox on the left of student name
    expect(fileContent).toContain('aria-label={`Select ${student.firstName} ${student.lastName || \'\'}`}');
  });

  it('renders bulk marking actions bar when students are selected', () => {
    expect(fileContent).toContain('Clear selection');
    expect(fileContent).toContain("handleBulkStatusChange('Present')");
    expect(fileContent).toContain("handleBulkStatusChange('Absent')");
    expect(fileContent).toContain("handleBulkStatusChange('Late')");
  });

  it('preserves existing individual row status action buttons (Present, Absent, Late)', () => {
    expect(fileContent).toContain("['Present', 'Absent', 'Late'].map((status) => (");
    expect(fileContent).toContain('onClick={() => handleStatusChange(student.id, status)}');
  });
});
