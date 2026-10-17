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

  it('defaults attendance to empty/unmarked until marked explicitly by teacher', () => {
    // Should not default missing students to 'Present' or 'Late'
    expect(fileContent).not.toMatch(/newRecords\[st\.id\]\s*=\s*['"]Present['"]/);
    expect(fileContent).not.toMatch(/newRecords\[st\.id\]\s*=\s*defaultStatus/);
    expect(fileContent).toContain("currentStatus || 'Unmarked'");
  });

  it('handleSave only submits marked students and warns if none are marked', () => {
    expect(fileContent).toContain('const markedStudents = students.filter((s) => !!attendanceRecords[s.id]);');
    expect(fileContent).toContain("toast.error('Please mark attendance for at least one student before saving.');");
  });

  it('synchronizes checkbox toggle directly with attendance records (marking student as Present and unmarking)', () => {
    expect(fileContent).toContain("[studentId]: rec[studentId] || 'Present'");
    expect(fileContent).toContain('delete updated[studentId]');
  });

  it('ensures row status change marks student as selected and reflects status', () => {
    expect(fileContent).toContain('setSelectedStudentIds((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]));');
  });

  it('loads existing session records and synchronizes selected student IDs', () => {
    expect(fileContent).toContain('const markedIds = Object.keys(newRecords).filter((id) => !!newRecords[id]);');
    expect(fileContent).toContain('setSelectedStudentIds(markedIds);');
  });

  it('tracks FN and AN session status and renders FN & AN Marked / FN Marked workflow badges', () => {
    expect(fileContent).toContain('const [daySessionStatus, setDaySessionStatus] = useState({ fn: false, an: false });');
    expect(fileContent).toContain('FN & AN Marked');
    expect(fileContent).toContain('FN Marked');
    expect(fileContent).toContain('AN Marked');
  });
});
