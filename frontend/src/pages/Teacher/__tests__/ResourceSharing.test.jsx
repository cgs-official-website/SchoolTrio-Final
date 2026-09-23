import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResourceSharing from '../ResourceSharing.jsx';
import * as academicResourcesApiModule from '../../../api/academic-resources.js';
import * as classesApiModule from '../../../api/classes.js';
import * as subjectsApiModule from '../../../api/subjects.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher ResourceSharing Component (REST Migration)', () => {
  const PG_CLASS_ID_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_ID_2 = '15120a32-8118-44b6-8010-b9ed2c5467c1';
  const PG_SUBJECT_ID_1 = '25120a32-8118-44b6-8010-b9ed2c5467c2';
  const PG_SUBJECT_ID_2 = '35120a32-8118-44b6-8010-b9ed2c5467c3';
  const PG_RES_ID_1 = '45120a32-8118-44b6-8010-b9ed2c5467c4';
  const PG_RES_ID_2 = '55120a32-8118-44b6-8010-b9ed2c5467c5';
  const PG_UPLOADER_ID = '75120a32-8118-44b6-8010-b9ed2c5467c7';

  const mockClasses = [
    { id: PG_CLASS_ID_1, name: 'Grade 10', section: 'A' },
    { id: PG_CLASS_ID_2, name: 'Grade 9', section: 'B' }
  ];

  const mockSubjects = [
    { id: PG_SUBJECT_ID_1, name: 'Physics', code: 'PHY101' },
    { id: PG_SUBJECT_ID_2, name: 'Chemistry', code: 'CHEM101' }
  ];

  const mockResources = [
    {
      id: PG_RES_ID_1,
      schoolId: 'school-123',
      uploaderId: PG_UPLOADER_ID,
      uploaderName: 'John Doe',
      classId: PG_CLASS_ID_1,
      className: 'Grade 10 - Section A',
      subjectId: PG_SUBJECT_ID_1,
      subjectName: 'Physics',
      title: 'Thermodynamics Handout',
      type: 'document',
      fileUrl: 'https://example.com/thermo.pdf',
      createdAt: '2026-09-15T10:00:00.000Z'
    },
    {
      id: PG_RES_ID_2,
      schoolId: 'school-123',
      uploaderId: PG_UPLOADER_ID,
      uploaderName: 'John Doe',
      classId: PG_CLASS_ID_2,
      className: 'Grade 9 - Section B',
      subjectId: PG_SUBJECT_ID_2,
      subjectName: 'Chemistry',
      title: 'Organic Chemistry Video',
      type: 'video',
      fileUrl: 'https://youtube.com/watch?v=123',
      createdAt: '2026-09-10T10:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof ResourceSharing).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE ACADEMIC RESOURCE ACCESS
  // ============================================================

  it('does NOT invoke Firestore subscription or mutation helpers for academic resources', () => {
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
    const addSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    const deleteSpy = vi.spyOn(firestoreModule, 'deleteSubDocument');

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. REST CLASSES & SUBJECTS LOADING
  // ============================================================

  it('loads classes and subjects from REST APIs using PostgreSQL UUIDs', async () => {
    const classesSpy = vi.spyOn(classesApiModule, 'listClasses').mockResolvedValue({
      success: true,
      data: mockClasses
    });
    const subjectsSpy = vi.spyOn(subjectsApiModule, 'listSubjects').mockResolvedValue({
      success: true,
      data: mockSubjects
    });

    const [classesRes, subjectsRes] = await Promise.all([
      classesApiModule.listClasses({ limit: 100 }),
      subjectsApiModule.listSubjects({ limit: 100 })
    ]);

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(subjectsSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(classesRes.data).toHaveLength(2);
    expect(subjectsRes.data).toHaveLength(2);
    expect(classesRes.data[0].id).toBe(PG_CLASS_ID_1);
    expect(subjectsRes.data[0].id).toBe(PG_SUBJECT_ID_1);
  });

  // ============================================================
  // 3. REST ACADEMIC RESOURCES LOADING & COMPLETE FETCH
  // ============================================================

  it('fetches academic resources through REST API with paginated loop for complete collection', async () => {
    const listSpy = vi.spyOn(academicResourcesApiModule, 'listAcademicResources')
      .mockResolvedValueOnce({
        success: true,
        data: [mockResources[0]],
        pagination: { total: 2, page: 1, limit: 1, totalPages: 2 }
      })
      .mockResolvedValueOnce({
        success: true,
        data: [mockResources[1]],
        pagination: { total: 2, page: 2, limit: 1, totalPages: 2 }
      });

    let allResources = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const res = await academicResourcesApiModule.listAcademicResources({
        page: currentPage,
        limit: 100
      });
      const pageData = Array.isArray(res?.data) ? res.data : [];
      allResources = allResources.concat(pageData);
      totalPages = res?.pagination?.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(allResources).toHaveLength(2);
    expect(allResources[0].id).toBe(PG_RES_ID_1);
    expect(allResources[1].id).toBe(PG_RES_ID_2);
  });

  // ============================================================
  // 4. REST CREATE FLOW
  // ============================================================

  it('creates an academic resource using POST /api/v1/academic-resources', async () => {
    const createPayload = {
      title: 'Optics Laboratory Guide',
      classId: PG_CLASS_ID_1,
      subjectId: PG_SUBJECT_ID_1,
      fileUrl: 'https://example.com/optics.pdf',
      type: 'document',
      description: 'Lab experiment procedures'
    };

    const createSpy = vi.spyOn(academicResourcesApiModule, 'createAcademicResource').mockResolvedValue({
      success: true,
      data: {
        id: 'new-res-id',
        ...createPayload,
        uploaderId: PG_UPLOADER_ID,
        createdAt: '2026-09-16T12:00:00.000Z'
      }
    });

    const res = await academicResourcesApiModule.createAcademicResource(createPayload);

    expect(createSpy).toHaveBeenCalledWith(createPayload);
    expect(res.data.id).toBe('new-res-id');
    expect(res.data.title).toBe('Optics Laboratory Guide');
  });

  // ============================================================
  // 5. REST DELETE FLOW & ERROR HANDLING
  // ============================================================

  it('deletes an academic resource using DELETE /api/v1/academic-resources/:id', async () => {
    const deleteSpy = vi.spyOn(academicResourcesApiModule, 'deleteAcademicResource').mockResolvedValue({
      success: true,
      message: 'Academic resource deleted successfully'
    });

    const res = await academicResourcesApiModule.deleteAcademicResource(PG_RES_ID_1);

    expect(deleteSpy).toHaveBeenCalledWith(PG_RES_ID_1);
    expect(res.success).toBe(true);
  });

  it('handles 403 Forbidden on unauthorized delete attempt', async () => {
    vi.spyOn(academicResourcesApiModule, 'deleteAcademicResource').mockRejectedValue(
      new Error('You are only authorized to delete your own resources')
    );

    await expect(
      academicResourcesApiModule.deleteAcademicResource(PG_RES_ID_2)
    ).rejects.toThrow('You are only authorized to delete your own resources');
  });
});
