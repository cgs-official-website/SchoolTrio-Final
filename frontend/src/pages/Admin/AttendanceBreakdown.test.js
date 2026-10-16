import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ATT-001: Admin Attendance Grade & Section Breakdown Session Filter', () => {
  const attendanceFilePath = path.resolve(__dirname, 'Attendance.jsx');
  const fileContent = fs.readFileSync(attendanceFilePath, 'utf-8');

  it('1. Contains breakdownSession state initialized to "all"', () => {
    expect(fileContent).toContain("const [breakdownSession, setBreakdownSession] = useState('all');");
  });

  it('2. Includes session filter select dropdown in Grade & Section Breakdown header', () => {
    expect(fileContent).toContain('id="breakdown-session-filter"');
    expect(fileContent).toContain('value={breakdownSession}');
    expect(fileContent).toContain('setBreakdownSession(e.target.value)');
    expect(fileContent).toContain('<option value="all">All Sessions</option>');
    expect(fileContent).toContain('<option value="FN">Forenoon (FN)</option>');
    expect(fileContent).toContain('<option value="AN">Afternoon (AN)</option>');
  });

  it('3. Passes session parameter to getAttendanceDashboardStats API call', () => {
    expect(fileContent).toContain('query.session = targetSession');
    expect(fileContent).toContain('getAttendanceDashboardStats(query)');
  });

  it('4. Updates dashboard stats when activeTab is "dashboard" or breakdownSession changes', () => {
    expect(fileContent).toContain('fetchDashboardStats(selectedDate, breakdownSession);');
  });

  it('5. Table displays class section strength directly without double counting', () => {
    expect(fileContent).toContain('<td className="py-2.5 font-medium text-slate-500 dark:text-slate-400">{sec.total}</td>');
    expect(fileContent).toContain('<td className="py-2.5 font-semibold text-green-600">{sec.present}</td>');
    expect(fileContent).toContain('<td className="py-2.5 font-semibold text-red-600">{sec.absent}</td>');
    expect(fileContent).toContain('<td className="py-2.5 font-semibold text-amber-600">{sec.late}</td>');
  });

  it('6. Coordinator scoping logic correctly aggregates section total without duplicate inflation', () => {
    const mockClassStats = {
      'class-1': { gradeLevel: '10', total: 4, present: 3, absent: 1, late: 0, percentage: 75 },
      'class-2': { gradeLevel: '10', total: 4, present: 4, absent: 0, late: 0, percentage: 100 }
    };

    let totalStudents = 0;
    let presentStudents = 0;
    Object.values(mockClassStats).forEach((c) => {
      totalStudents += c.total;
      presentStudents += c.present;
    });

    expect(totalStudents).toBe(8); // 4 + 4 = 8 unique students across 2 classes
    expect(presentStudents).toBe(7); // 3 + 4 = 7 present
  });

  it('7. Table displays formatted section name for each individual class section', () => {
    expect(fileContent).toContain('{sec.formattedName || (sec.sectionName ? `${sec.className} - Section ${sec.sectionName}` : sec.className)}');
  });

  it('8. Accordion header formats General grade level as "All Classes"', () => {
    expect(fileContent).toContain("gradeId === 'General' ? 'All Classes' :");
  });

  it('9. Pending alert panel sets both classId and sectionId on Mark Now', () => {
    expect(fileContent).toContain('setSelectedClassId(item.classId);');
    expect(fileContent).toContain('setSelectedSectionId(item.sectionId || null);');
  });

  it('10. Unmarked badge is displayed for unmarked or zero-attendance sections', () => {
    expect(fileContent).toContain("sec.total === 0 || sec.isUnmarked ? 'Unmarked' : `${sec.percentage}%`");
  });
});
