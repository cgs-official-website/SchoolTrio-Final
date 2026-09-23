import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportCardService from '../../../src/modules/report-cards/report-card.service.js';
import * as reportCardRepository from '../../../src/modules/report-cards/report-card.repository.js';
import * as examRepository from '../../../src/modules/exams/exam.repository.js';
import * as attendanceRepository from '../../../src/modules/attendance/attendance.repository.js';
import * as studentRepository from '../../../src/modules/students/student.repository.js';
import * as assessmentRepository from '../../../src/modules/assessments/assessment.repository.js';
import * as parentRepository from '../../../src/modules/parents/parent.repository.js';
import * as templateService from '../../../src/modules/report-card-templates/report-card-template.service.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

describe('ReportCard Service Unit Tests (Phase 4C.7-C Batch 2)', () => {
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const OTHER_CLASS_ID = '44444444-4444-4444-8444-444444444444';
  const EXAM_ID = '55555555-5555-4555-8555-555555555555';
  const STUDENT_1_ID = '66666666-6666-4666-8666-666666666666';
  const STUDENT_2_ID = '77777777-7777-4777-8777-777777777777';
  const ASSESSMENT_1_ID = '88888888-8888-4888-8888-888888888888';
  const ASSESSMENT_2_ID = '99999999-9999-4999-8999-999999999999';
  const REPORT_CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockAdminActor = {
    id: 'admin-user-1',
    name: 'School Admin',
    email: 'admin@schoola.com',
    systemRole: 'ADMIN'
  };

  const mockTeacherActor = {
    id: 'teacher-user-1',
    userId: 'teacher-user-1',
    name: 'John Teacher',
    email: 'teacher@schoola.com',
    systemRole: 'TEACHER'
  };

  const mockParentActor = {
    id: 'parent-user-1',
    userId: 'parent-user-1',
    name: 'Jane Parent',
    email: 'parent@schoola.com',
    systemRole: 'PARENT'
  };

  const mockStudentActor = {
    id: 'student-user-1',
    userId: 'student-user-1',
    studentId: STUDENT_1_ID,
    name: 'Alice Student',
    email: 'student@schoola.com',
    systemRole: 'STUDENT'
  };

  const mockClass = {
    id: CLASS_ID,
    schoolId: SCHOOL_A,
    name: 'Grade 10 - A'
  };

  const mockExam = {
    id: EXAM_ID,
    schoolId: SCHOOL_A,
    name: 'Midterm Examination 2026',
    term: 'Term 1',
    academicYear: '2026-27',
    startDate: '2026-09-01',
    endDate: '2026-09-15'
  };

  const mockStudents = [
    {
      id: STUDENT_1_ID,
      schoolId: SCHOOL_A,
      classId: CLASS_ID,
      firstName: 'Alice',
      lastName: 'Smith',
      admissionNumber: 'SCH/2026/001',
      rollNumber: '1',
      class: { name: 'Grade 10 - A' },
      section: { name: 'A' }
    },
    {
      id: STUDENT_2_ID,
      schoolId: SCHOOL_A,
      classId: CLASS_ID,
      firstName: 'Bob',
      lastName: 'Jones',
      admissionNumber: 'SCH/2026/002',
      rollNumber: '2',
      class: { name: 'Grade 10 - A' },
      section: { name: 'A' }
    }
  ];

  const mockAssessments = [
    {
      id: ASSESSMENT_1_ID,
      schoolId: SCHOOL_A,
      classId: CLASS_ID,
      examId: EXAM_ID,
      title: 'Mathematics Paper',
      totalMarks: 100
    },
    {
      id: ASSESSMENT_2_ID,
      schoolId: SCHOOL_A,
      classId: CLASS_ID,
      examId: EXAM_ID,
      title: 'Science Paper',
      totalMarks: 100
    }
  ];

  const mockGrades = [
    {
      id: 'g-1',
      schoolId: SCHOOL_A,
      assessmentId: ASSESSMENT_1_ID,
      studentId: STUDENT_1_ID,
      marksObtained: 95.0,
      remarks: 'Excellent'
    },
    {
      id: 'g-2',
      schoolId: SCHOOL_A,
      assessmentId: ASSESSMENT_2_ID,
      studentId: STUDENT_1_ID,
      marksObtained: 85.0,
      remarks: 'Good'
    },
    {
      id: 'g-3',
      schoolId: SCHOOL_A,
      assessmentId: ASSESSMENT_1_ID,
      studentId: STUDENT_2_ID,
      marksObtained: 65.0,
      remarks: 'Needs improvement'
    }
    // Student 2 missed assessment 2 (ungraded)
  ];

  const mockTemplate = {
    config: {
      themeColor: '#3b82f6',
      header: { title: 'PROGRESS REPORT' },
      grading: { style: 'marks_and_grades' }
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Default mocks
    vi.spyOn(prisma.class, 'findFirst').mockResolvedValue(mockClass);
    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      data: { academicYear: '2026-27' }
    });
    vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
    vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);
    vi.spyOn(studentRepository, 'findStudents').mockResolvedValue(mockStudents);
    vi.spyOn(templateService, 'getReportCardTemplate').mockResolvedValue(mockTemplate);
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' });

    vi.spyOn(attendanceRepository, 'aggregateStudentRecords').mockResolvedValue({
      totalDays: 200,
      presentDays: 185,
      lateDays: 5,
      absentDays: 10,
      percentage: 95.0
    });

    vi.spyOn(prisma.reportCard, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.reportCard, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.reportCard, 'create').mockImplementation(async (args) => ({ id: REPORT_CARD_ID, ...args.data }));
    vi.spyOn(prisma.reportCard, 'update').mockImplementation(async (args) => ({ id: args.where.id, ...args.data }));
    vi.spyOn(prisma.reportCard, 'count').mockResolvedValue(0);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(prisma);
    });
  });

  // =========================================================================
  // 1. LETTER GRADE CALCULATION (CBSE SCALE)
  // =========================================================================
  describe('1. Standard Letter Grade Calculation (CBSE Scale)', () => {
    it('calculates letter grades accurately across all boundaries', () => {
      expect(reportCardService.calculateLetterGrade(95)).toBe('A1');
      expect(reportCardService.calculateLetterGrade(91)).toBe('A1');
      expect(reportCardService.calculateLetterGrade(90.9)).toBe('A2');
      expect(reportCardService.calculateLetterGrade(81)).toBe('A2');
      expect(reportCardService.calculateLetterGrade(80.5)).toBe('B1');
      expect(reportCardService.calculateLetterGrade(71)).toBe('B1');
      expect(reportCardService.calculateLetterGrade(65)).toBe('B2');
      expect(reportCardService.calculateLetterGrade(61)).toBe('B2');
      expect(reportCardService.calculateLetterGrade(55)).toBe('C1');
      expect(reportCardService.calculateLetterGrade(51)).toBe('C1');
      expect(reportCardService.calculateLetterGrade(45)).toBe('C2');
      expect(reportCardService.calculateLetterGrade(41)).toBe('C2');
      expect(reportCardService.calculateLetterGrade(35)).toBe('D');
      expect(reportCardService.calculateLetterGrade(33)).toBe('D');
      expect(reportCardService.calculateLetterGrade(32.9)).toBe('E');
      expect(reportCardService.calculateLetterGrade(0)).toBe('E');
      expect(reportCardService.calculateLetterGrade(-5)).toBe('E');
      expect(reportCardService.calculateLetterGrade('invalid')).toBe('E');
    });
  });

  // =========================================================================
  // 2. FORMAL EXAM REPORT CARD PREVIEW & VALIDATION
  // =========================================================================
  describe('2. Formal Exam Report Card Preview & Validation', () => {
    it('generates formal exam report card preview with aggregated marks and attendance', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const preview = await reportCardService.generateReportCardPreview(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      expect(preview).toBeDefined();
      expect(preview.classId).toBe(CLASS_ID);
      expect(preview.examId).toBe(EXAM_ID);
      expect(preview.examName).toBe('Midterm Examination 2026');
      expect(preview.term).toBe('Term 1');
      expect(preview.studentsCount).toBe(2);

      // Student 1 (Alice): 95 + 85 = 180 / 200 => 90.0% => A2
      const alice = preview.students.find(s => s.student.id === STUDENT_1_ID);
      expect(alice.totalObtained).toBe(180);
      expect(alice.totalMax).toBe(200);
      expect(alice.percentage).toBe('90.0');
      expect(alice.overallGrade).toBe('A2');
      expect(alice.attendanceSummary.percentage).toBe(95.0);

      // Student 2 (Bob): 65 / 200 => 32.5% => E
      const bob = preview.students.find(s => s.student.id === STUDENT_2_ID);
      expect(bob.totalObtained).toBe(65);
      expect(bob.totalMax).toBe(200);
      expect(bob.percentage).toBe('32.5');
      expect(bob.overallGrade).toBe('E');
    });

    it('throws NotFoundError when class does not exist in tenant', async () => {
      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue(null);

      await expect(
        reportCardService.generateReportCardPreview(SCHOOL_A, { classId: 'non-existent' }, mockAdminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when exam does not exist in tenant (cross-tenant exam isolation)', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(null);

      await expect(
        reportCardService.generateReportCardPreview(SCHOOL_A, { classId: CLASS_ID, examId: 'school-b-exam-uuid' }, mockAdminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('enforces teacher assigned class restriction', async () => {
      vi.spyOn(assessmentRepository, 'findStaffProfileByUserId').mockResolvedValue({
        assignedClassId: OTHER_CLASS_ID
      });

      await expect(
        reportCardService.generateReportCardPreview(SCHOOL_A, { classId: CLASS_ID }, mockTeacherActor)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // =========================================================================
  // 3. CONTINUOUS ASSESSMENT REPORT CARD PREVIEW
  // =========================================================================
  describe('3. Continuous Assessment Report Card Preview', () => {
    it('generates continuous assessment summary with null examId and title "Class Assessments Summary"', async () => {
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const preview = await reportCardService.generateReportCardPreview(
        SCHOOL_A,
        { classId: CLASS_ID, examId: null },
        mockAdminActor
      );

      expect(preview).toBeDefined();
      expect(preview.examId).toBeNull();
      expect(preview.examName).toBe('Class Assessments Summary');
      expect(preview.term).toBeNull();
      expect(preview.studentsCount).toBe(2);
    });
  });

  // =========================================================================
  // 4. PUBLICATION, ATOMIC UPSERT & IDEMPOTENCY
  // =========================================================================
  describe('4. Publication, Atomic Upsert & Idempotency', () => {
    it('publishes formal exam report cards and emits audit log', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const upsertSpy = vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockImplementation(async (schoolId, studentId, examId, data) => ({
        id: REPORT_CARD_ID,
        schoolId,
        studentId,
        examId,
        title: data.title,
        term: data.term,
        marksData: data.marksData,
        grades: data.grades,
        attendanceSummary: data.attendanceSummary,
        publishedAt: data.publishedAt,
        updatedAt: new Date()
      }));

      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      const result = await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      expect(result.publishedCount).toBe(2);
      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A,
          actionPerformed: 'PUBLISH_FORMAL_REPORT_CARDS',
          entityType: 'ReportCard'
        })
      );
    });

    it('publishes continuous report cards with upsertContinuousReportCard', async () => {
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const upsertSpy = vi.spyOn(reportCardRepository, 'upsertContinuousReportCard').mockImplementation(async (schoolId, studentId, classId, data) => ({
        id: REPORT_CARD_ID,
        schoolId,
        studentId,
        examId: null,
        title: data.title,
        term: null,
        marksData: data.marksData,
        grades: data.grades,
        attendanceSummary: data.attendanceSummary,
        publishedAt: data.publishedAt,
        updatedAt: new Date()
      }));

      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      const result = await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: null },
        mockAdminActor
      );

      expect(result.publishedCount).toBe(2);
      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A,
          actionPerformed: 'PUBLISH_CONTINUOUS_REPORT_CARDS',
          entityType: 'ReportCard'
        })
      );
    });

    it('filters publication to specific studentIds when provided', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const upsertSpy = vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockResolvedValue({
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_1_ID,
        examId: EXAM_ID,
        marksData: {}
      });

      const result = await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_1_ID] },
        mockAdminActor
      );

      expect(result.publishedCount).toBe(1);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
    });

    it('throws ValidationError if requested student does not belong to class', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);

      await expect(
        reportCardService.publishReportCards(
          SCHOOL_A,
          { classId: CLASS_ID, examId: EXAM_ID, studentIds: ['unrelated-student-id'] },
          mockAdminActor
        )
      ).rejects.toThrow(ValidationError);
    });

    it('preserves successful publish even if non-blocking audit fails', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(prisma.assessment, 'findMany').mockResolvedValue(mockAssessments);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);
      vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockResolvedValue({
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_1_ID,
        examId: EXAM_ID,
        marksData: {}
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockRejectedValue(new Error('Audit DB down'));

      const result = await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      expect(result.publishedCount).toBe(2);
    });
  });

  // =========================================================================
  // 5. RETRIEVAL & ROLE-BASED ACCESS CONTROL
  // =========================================================================
  describe('5. Retrieval & Role-Based Access Control', () => {
    const mockReportCardRecord = {
      id: REPORT_CARD_ID,
      schoolId: SCHOOL_A,
      studentId: STUDENT_1_ID,
      title: 'Midterm Examination 2026',
      term: 'Term 1',
      examId: EXAM_ID,
      marksData: { totalObtained: 180, totalMax: 200 },
      grades: { percentage: 90.0, overallGrade: 'A2' },
      attendanceSummary: { percentage: 95.0 },
      publishedAt: new Date('2026-09-10T10:00:00Z'),
      updatedAt: new Date('2026-09-10T10:00:00Z'),
      student: {
        id: STUDENT_1_ID,
        firstName: 'Alice',
        lastName: 'Smith',
        classId: CLASS_ID,
        admissionNumber: 'SCH/2026/001'
      }
    };

    it('allows Admin to retrieve report card by ID', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(mockReportCardRecord);

      const result = await reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, mockAdminActor);
      expect(result).toBeDefined();
      expect(result.id).toBe(REPORT_CARD_ID);
      expect(result.studentId).toBe(STUDENT_1_ID);
    });

    it('throws NotFoundError for cross-tenant report card lookup', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(null);

      await expect(
        reportCardService.getReportCard(SCHOOL_B, REPORT_CARD_ID, mockAdminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('allows Student to retrieve their own report card', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(mockReportCardRecord);

      const result = await reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, mockStudentActor);
      expect(result.id).toBe(REPORT_CARD_ID);
    });

    it('denies Student from retrieving another student report card with ForbiddenError', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(mockReportCardRecord);

      const otherStudentActor = {
        id: 'student-user-2',
        studentId: STUDENT_2_ID,
        systemRole: 'STUDENT'
      };

      await expect(
        reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, otherStudentActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows linked Parent to retrieve report card', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(mockReportCardRecord);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: 'parent-profile-1' });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue({ id: 'link-1' });

      const result = await reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, mockParentActor);
      expect(result.id).toBe(REPORT_CARD_ID);
    });

    it('denies unlinked Parent with ForbiddenError', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(mockReportCardRecord);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: 'parent-profile-1' });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      await expect(
        reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, mockParentActor)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // =========================================================================
  // 6. ATTENDANCE AGGREGATION & EDGE CASES
  // =========================================================================
  describe('6. Attendance Aggregation & Edge Cases', () => {
    it('handles 0 attendance sessions gracefully with 100% default', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(attendanceRepository, 'aggregateStudentRecords').mockResolvedValue({
        totalDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        percentage: 100
      });

      const preview = await reportCardService.generateReportCardPreview(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      const alice = preview.students.find(s => s.student.id === STUDENT_1_ID);
      expect(alice.attendanceSummary.totalSessions).toBe(0);
      expect(alice.attendanceSummary.percentage).toBe(100);
    });

    it('calculates 0% attendance when student is absent for all sessions', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(attendanceRepository, 'aggregateStudentRecords').mockResolvedValue({
        totalDays: 50,
        presentDays: 0,
        lateDays: 0,
        absentDays: 50,
        percentage: 0.0
      });

      const preview = await reportCardService.generateReportCardPreview(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      const alice = preview.students.find(s => s.student.id === STUDENT_1_ID);
      expect(alice.attendanceSummary.totalSessions).toBe(50);
      expect(alice.attendanceSummary.present).toBe(0);
      expect(alice.attendanceSummary.percentage).toBe(0.0);
    });

    it('counts Late days as attended in attendance summary', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(attendanceRepository, 'aggregateStudentRecords').mockResolvedValue({
        totalDays: 100,
        presentDays: 80,
        lateDays: 10,
        absentDays: 10,
        percentage: 90.0
      });

      const preview = await reportCardService.generateReportCardPreview(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID },
        mockAdminActor
      );

      const alice = preview.students.find(s => s.student.id === STUDENT_1_ID);
      expect(alice.attendanceSummary.present).toBe(80);
      expect(alice.attendanceSummary.late).toBe(10);
      expect(alice.attendanceSummary.percentage).toBe(90.0);
    });
  });

  // =========================================================================
  // 7. SNAPSHOT IMMUTABILITY & SECURITY PROTECTION
  // =========================================================================
  describe('7. Snapshot Immutability & Security Protection', () => {
    it('persists frozen snapshot that does not dynamically mutate with later live data', async () => {
      const storedReportCard = {
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_1_ID,
        title: 'Midterm Examination 2026',
        term: 'Term 1',
        examId: EXAM_ID,
        marksData: {
          totalObtained: 180,
          totalMax: 200,
          percentage: '90.0',
          overallGrade: 'A2',
          reportTemplate: { themeColor: '#3b82f6' }
        },
        grades: { percentage: 90.0, overallGrade: 'A2' },
        attendanceSummary: { percentage: 95.0, totalSessions: 200 },
        publishedAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z')
      };

      vi.spyOn(reportCardRepository, 'findReportCardById').mockResolvedValue(storedReportCard);

      // Even if template is changed later to purple #8b5cf6
      vi.spyOn(templateService, 'getReportCardTemplate').mockResolvedValue({
        config: { themeColor: '#8b5cf6' }
      });

      const result = await reportCardService.getReportCard(SCHOOL_A, REPORT_CARD_ID, mockAdminActor);
      expect(result.marksData.reportTemplate.themeColor).toBe('#3b82f6');
      expect(result.marksData.totalObtained).toBe(180);
    });

    it('rejects client attempts to spoof schoolId or inject unauthorized tenant scope', async () => {
      await expect(
        reportCardService.getReportCard(null, REPORT_CARD_ID, mockAdminActor)
      ).rejects.toThrow(TenantAccessError);

      await expect(
        reportCardService.listStudentReportCards(null, STUDENT_1_ID, {}, mockAdminActor)
      ).rejects.toThrow(TenantAccessError);
    });
  });

  // =========================================================================
  // 8. LISTING REPORT CARDS (STUDENT & CLASS)
  // =========================================================================
  describe('8. Listing Report Cards for Student & Class', () => {
    it('lists report cards for a student with pagination', async () => {
      vi.spyOn(prisma.student, 'findFirst').mockResolvedValue(mockStudents[0]);
      vi.spyOn(reportCardRepository, 'findReportCardsByStudent').mockResolvedValue({
        items: [
          {
            id: REPORT_CARD_ID,
            schoolId: SCHOOL_A,
            studentId: STUDENT_1_ID,
            title: 'Midterm Examination 2026',
            publishedAt: new Date()
          }
        ],
        total: 1
      });

      const result = await reportCardService.listStudentReportCards(
        SCHOOL_A,
        STUDENT_1_ID,
        { page: 1, limit: 10 },
        mockAdminActor
      );

      expect(result.reportCards).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('lists report cards for a class with pagination', async () => {
      vi.spyOn(reportCardRepository, 'findReportCardsByClass').mockResolvedValue({
        items: [
          {
            id: REPORT_CARD_ID,
            schoolId: SCHOOL_A,
            studentId: STUDENT_1_ID,
            title: 'Midterm Examination 2026',
            publishedAt: new Date()
          }
        ],
        total: 1
      });

      const result = await reportCardService.listClassReportCards(
        SCHOOL_A,
        CLASS_ID,
        { page: 1, limit: 10 },
        mockAdminActor
      );

      expect(result.reportCards).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  // =========================================================================
  // 9. TARGETED VERIFICATION: FORMAL REPORT IDENTITY & DUPLICATE SCENARIOS
  // =========================================================================
  describe('9. Targeted Verification: Formal Report Identity & Duplicate Scenarios', () => {
    it('updates existing formal report on re-publication without creating duplicate logical records', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);

      let createdCount = 0;
      let updatedCount = 0;
      let database = [];

      vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockImplementation(async (schoolId, studentId, examId, data) => {
        const existing = database.find(r => r.schoolId === schoolId && r.studentId === studentId && r.examId === examId);
        if (existing) {
          updatedCount++;
          existing.marksData = data.marksData;
          existing.publishedAt = data.publishedAt;
          return existing;
        }
        createdCount++;
        const newRecord = {
          id: `rc-${createdCount}`,
          schoolId,
          studentId,
          examId,
          title: data.title,
          term: data.term,
          marksData: data.marksData,
          publishedAt: data.publishedAt,
          createdAt: data.publishedAt
        };
        database.push(newRecord);
        return newRecord;
      });

      // First publication
      const firstPub = await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_ID }, mockAdminActor);
      expect(firstPub.publishedCount).toBe(2);
      expect(createdCount).toBe(2);
      expect(updatedCount).toBe(0);
      expect(database).toHaveLength(2);

      // Re-publication (second publish for same School A + Class + Exam A)
      const secondPub = await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_ID }, mockAdminActor);
      expect(secondPub.publishedCount).toBe(2);
      expect(createdCount).toBe(2);
      expect(updatedCount).toBe(2);
      expect(database).toHaveLength(2); // Still exactly 2 records, zero duplicates
    });

    it('creates distinct reports for different exams (Student A + Exam A vs Student A + Exam B)', async () => {
      const EXAM_2_ID = 'exam-2222-2222-2222-222222222222';
      const mockExam2 = { ...mockExam, id: EXAM_2_ID, name: 'Final Examination 2026' };

      const database = [];
      vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockImplementation(async (schoolId, studentId, examId, data) => {
        const existing = database.find(r => r.schoolId === schoolId && r.studentId === studentId && r.examId === examId);
        if (existing) return existing;
        const newRecord = { id: `rc-${database.length + 1}`, schoolId, studentId, examId, title: data.title };
        database.push(newRecord);
        return newRecord;
      });

      vi.spyOn(examRepository, 'findExamById').mockImplementation(async (_sId, id) => id === EXAM_ID ? mockExam : mockExam2);

      await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_1_ID] }, mockAdminActor);
      await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_2_ID, studentIds: [STUDENT_1_ID] }, mockAdminActor);

      expect(database).toHaveLength(2);
      expect(database[0].examId).toBe(EXAM_ID);
      expect(database[1].examId).toBe(EXAM_2_ID);
    });
  });

  // =========================================================================
  // 10. TARGETED VERIFICATION: CONTINUOUS REPORT & HISTORICAL CLASS IDENTITY
  // =========================================================================
  describe('10. Targeted Verification: Continuous Report & Historical Class Identity', () => {
    it('preserves historical continuous report for Class A when student transfers to Class B', async () => {
      let database = [];

      vi.spyOn(reportCardRepository, 'upsertContinuousReportCard').mockImplementation(async (schoolId, studentId, classId, data) => {
        const existing = database.find(r => r.schoolId === schoolId && r.studentId === studentId && r.examId === null && r.marksData.classId === classId);
        if (existing) {
          existing.marksData = data.marksData;
          return existing;
        }
        const newRecord = {
          id: `cont-rc-${database.length + 1}`,
          schoolId,
          studentId,
          examId: null,
          title: data.title,
          marksData: data.marksData
        };
        database.push(newRecord);
        return newRecord;
      });

      // 1. Publish continuous report for Class A
      await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: null, studentIds: [STUDENT_1_ID] }, mockAdminActor);
      expect(database).toHaveLength(1);
      expect(database[0].marksData.classId).toBe(CLASS_ID);

      // 2. Re-publish Class A continuous report -> updates existing
      await reportCardService.publishReportCards(SCHOOL_A, { classId: CLASS_ID, examId: null, studentIds: [STUDENT_1_ID] }, mockAdminActor);
      expect(database).toHaveLength(1);

      // 3. Student transfers to Class B. Publish Class B continuous report
      const mockClassB = { id: OTHER_CLASS_ID, schoolId: SCHOOL_A, name: 'Grade 10 - B' };
      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue(mockClassB);
      vi.spyOn(studentRepository, 'findStudents').mockResolvedValue([{ ...mockStudents[0], classId: OTHER_CLASS_ID }]);

      await reportCardService.publishReportCards(SCHOOL_A, { classId: OTHER_CLASS_ID, examId: null, studentIds: [STUDENT_1_ID] }, mockAdminActor);

      // Verify that database now has 2 continuous reports: 1 for historical Class A, 1 for new Class B!
      expect(database).toHaveLength(2);
      expect(database[0].marksData.classId).toBe(CLASS_ID);
      expect(database[1].marksData.classId).toBe(OTHER_CLASS_ID);
    });
  });

  // =========================================================================
  // 11. TARGETED VERIFICATION: CONCURRENCY ROW LOCKING
  // =========================================================================
  describe('11. Targeted Verification: Concurrency Row Locking', () => {
    it('acquires pessimistic row lock on student record within transaction before upsert', async () => {
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      const lockSpy = vi.spyOn(studentRepository, 'findStudentByIdForUpdate');
      vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockResolvedValue({
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_1_ID
      });

      await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_1_ID] },
        mockAdminActor
      );

      // Verify lock was acquired inside transaction for the student
      expect(lockSpy).toHaveBeenCalledWith(SCHOOL_A, STUDENT_1_ID, expect.anything());
    });
  });

  // =========================================================================
  // 12. TARGETED VERIFICATION: FORMAL & CONTINUOUS 4-WAY MATRICES
  // =========================================================================
  describe('12. Targeted Verification: 4-Way Identity Matrix Tests', () => {
    it('validates 4-way formal matrix isolation (School A vs School B, Student A vs B, Exam A vs B)', async () => {
      const EXAM_B_ID = 'exam-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const database = [];

      vi.spyOn(prisma.reportCard, 'findFirst').mockImplementation(async (args) => {
        const { schoolId, studentId, examId } = args.where;
        return database.find(r => r.schoolId === schoolId && r.studentId === studentId && r.examId === examId) || null;
      });

      vi.spyOn(prisma.reportCard, 'create').mockImplementation(async (args) => {
        const record = { id: `rc-${database.length + 1}`, ...args.data };
        database.push(record);
        return record;
      });

      // 1. School A + Student A + Exam A
      await reportCardRepository.upsertFormalReportCard(SCHOOL_A, STUDENT_1_ID, EXAM_ID, { title: 'Exam A' });
      // 2. School A + Student B + Exam A
      await reportCardRepository.upsertFormalReportCard(SCHOOL_A, STUDENT_2_ID, EXAM_ID, { title: 'Exam A' });
      // 3. School A + Student A + Exam B
      await reportCardRepository.upsertFormalReportCard(SCHOOL_A, STUDENT_1_ID, EXAM_B_ID, { title: 'Exam B' });
      // 4. School B + Student A + Exam A
      await reportCardRepository.upsertFormalReportCard(SCHOOL_B, STUDENT_1_ID, EXAM_ID, { title: 'Exam A' });

      expect(database).toHaveLength(4);

      // Verify School A + Student A + Exam A only matches itself
      const matchA = await reportCardRepository.findFormalReportCard(SCHOOL_A, STUDENT_1_ID, EXAM_ID);
      expect(matchA.schoolId).toBe(SCHOOL_A);
      expect(matchA.studentId).toBe(STUDENT_1_ID);
      expect(matchA.examId).toBe(EXAM_ID);

      // Verify School B query gets School B record
      const matchB = await reportCardRepository.findFormalReportCard(SCHOOL_B, STUDENT_1_ID, EXAM_ID);
      expect(matchB.schoolId).toBe(SCHOOL_B);
    });

    it('validates 4-way continuous matrix isolation (School A vs B, Student A vs B, Class A vs B)', async () => {
      const database = [];

      vi.spyOn(prisma.reportCard, 'findMany').mockImplementation(async (args) => {
        const { schoolId, studentId } = args.where;
        return database.filter(r => r.schoolId === schoolId && r.studentId === studentId && r.examId === null);
      });

      vi.spyOn(prisma.reportCard, 'findFirst').mockImplementation(async (args) => {
        const { id, schoolId } = args.where;
        return database.find(r => r.id === id && r.schoolId === schoolId) || null;
      });

      vi.spyOn(prisma.reportCard, 'create').mockImplementation(async (args) => {
        const record = { id: `rc-${database.length + 1}`, ...args.data };
        database.push(record);
        return record;
      });

      // 1. School A + Student A + Class A
      await reportCardRepository.upsertContinuousReportCard(SCHOOL_A, STUDENT_1_ID, CLASS_ID, { title: 'Summary', marksData: { classId: CLASS_ID } });
      // 2. School A + Student A + Class B
      await reportCardRepository.upsertContinuousReportCard(SCHOOL_A, STUDENT_1_ID, OTHER_CLASS_ID, { title: 'Summary', marksData: { classId: OTHER_CLASS_ID } });
      // 3. School A + Student B + Class A
      await reportCardRepository.upsertContinuousReportCard(SCHOOL_A, STUDENT_2_ID, CLASS_ID, { title: 'Summary', marksData: { classId: CLASS_ID } });
      // 4. School B + Student A + Class A
      await reportCardRepository.upsertContinuousReportCard(SCHOOL_B, STUDENT_1_ID, CLASS_ID, { title: 'Summary', marksData: { classId: CLASS_ID } });

      expect(database).toHaveLength(4);

      // Verify School A + Student A + Class A matches only 1 record
      const match = await reportCardRepository.findContinuousReportCard(SCHOOL_A, STUDENT_1_ID, CLASS_ID);
      expect(match.schoolId).toBe(SCHOOL_A);
      expect(match.studentId).toBe(STUDENT_1_ID);
      expect(match.marksData.classId).toBe(CLASS_ID);
    });
  });

  // =========================================================================
  // 13. TARGETED VERIFICATION: REPUBLISH TIMESTAMPS & SNAPSHOT REPLACEMENT
  // =========================================================================
  describe('13. Targeted Verification: Republish Timestamps & Snapshot Replacement', () => {
    it('preserves createdAt while advancing publishedAt and updatedAt on re-publish with newly aggregated values', async () => {
      const T1 = new Date('2026-09-01T10:00:00Z');
      const T2 = new Date('2026-09-15T15:30:00Z');

      const initialRecord = {
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_1_ID,
        examId: EXAM_ID,
        title: 'Midterm Examination 2026',
        marksData: { totalObtained: 100, totalMax: 200, percentage: '50.0' },
        grades: { percentage: 50.0, overallGrade: 'C1' },
        attendanceSummary: { totalSessions: 100, percentage: 80.0 },
        createdAt: T1,
        publishedAt: T1,
        updatedAt: T1
      };

      let savedData = null;
      vi.spyOn(reportCardRepository, 'upsertFormalReportCard').mockImplementation(async (schoolId, studentId, examId, data) => {
        savedData = {
          ...initialRecord,
          ...data,
          createdAt: initialRecord.createdAt, // createdAt preserved
          publishedAt: T2,
          updatedAt: T2
        };
        return savedData;
      });

      // Live data is updated (Student obtained 180 instead of 100)
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(mockExam);
      vi.spyOn(prisma.assessmentGrade, 'findMany').mockResolvedValue(mockGrades);

      const result = await reportCardService.publishReportCards(
        SCHOOL_A,
        { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_1_ID] },
        mockAdminActor
      );

      expect(result.publishedCount).toBe(1);
      expect(savedData.createdAt).toEqual(T1); // Preserved
      expect(savedData.publishedAt).toEqual(T2); // Advanced
      expect(savedData.updatedAt).toEqual(T2); // Advanced
      expect(savedData.marksData.totalObtained).toBe(180); // Replaced snapshot
      expect(savedData.grades.overallGrade).toBe('A2'); // Replaced grade
    });
  });
});

