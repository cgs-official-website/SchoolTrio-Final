import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('BUG-001: Teacher Portal Homework Status Read-Only Verification', () => {
  const filePath = path.resolve(__dirname, 'HomeworkManagement.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  it('verifies Teacher Portal does NOT contain an editable status select dropdown in the roster', () => {
    // Should not contain select with status options in student roster
    expect(fileContent).not.toMatch(/<select[^>]*value=\{status\}[^>]*onChange/);
    expect(fileContent).not.toContain('<option value="Not Started">Not Started</option>');
    expect(fileContent).not.toContain('<option value="In Progress">In Progress</option>');
    expect(fileContent).not.toContain('<option value="Completed">Completed</option>');
    expect(fileContent).not.toContain('<option value="Submitted">Submitted</option>');
  });

  it('verifies Teacher Portal renders status using a read-only badge', () => {
    // Should contain read-only rounded-full badge rendering
    expect(fileContent).toContain('rounded-full text-xs font-bold whitespace-nowrap');
    expect(fileContent).toContain('{status}');
  });

  it('verifies status mutation handler handleUpdateStudentSubmission is removed', () => {
    expect(fileContent).not.toContain('handleUpdateStudentSubmission');
    expect(fileContent).not.toContain('updateSubmission(');
  });

  it('verifies Excel evaluation upload omits teacher-driven status mutation', () => {
    // Should not push status in Excel submissions
    expect(fileContent).not.toMatch(/submissionsByHwId\.get\(targetHwId\)\.push\(\{[^}]*status:/);
    // Excel template should designate status as Read Only
    expect(fileContent).toContain('Status (Read Only)');
    expect(fileContent).toContain('Status is read-only');
  });

  it('verifies status labels and color mappings are preserved for viewing', () => {
    expect(fileContent).toContain("if (status === 'In Progress') statusColor = 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';");
    expect(fileContent).toContain("if (status === 'Completed') statusColor = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';");
    expect(fileContent).toContain("if (status === 'Submitted') statusColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';");
  });
});
