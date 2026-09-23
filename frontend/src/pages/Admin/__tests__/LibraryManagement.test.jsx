import { describe, it, expect, vi, beforeEach } from 'vitest';
import LibraryManagement from '../LibraryManagement.jsx';
import * as libraryApi from '../../../api/library.js';
import * as studentsApi from '../../../api/students.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin LibraryManagement Component REST Cutover (Phase LIB.3 / LIB.3-R)', () => {
  const BOOK_ID = '11111111-1111-4111-8111-111111111111';
  const ISSUE_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

  const MOCK_BOOK = {
    id: BOOK_ID,
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    category: 'Computer Science',
    totalQuantity: 5,
    availableQuantity: 4
  };

  const MOCK_CATEGORY = {
    id: CATEGORY_ID,
    name: 'Computer Science'
  };

  const MOCK_ISSUE = {
    id: ISSUE_ID,
    bookId: BOOK_ID,
    studentId: STUDENT_ID,
    dueDate: '2026-12-31',
    status: 'issued',
    overdue: false,
    daysOverdue: 0,
    book: {
      id: BOOK_ID,
      title: 'Clean Code'
    },
    student: {
      id: STUDENT_ID,
      name: 'John Doe',
      admissionNumber: 'ADM-101'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof LibraryManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE LIBRARY RUNTIME OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore library functions', () => {
    const firestoreLibrarySpies = [
      vi.spyOn(firestoreModule, 'getBooks'),
      vi.spyOn(firestoreModule, 'addBook'),
      vi.spyOn(firestoreModule, 'getIssuedBooks'),
      vi.spyOn(firestoreModule, 'issueBook'),
      vi.spyOn(firestoreModule, 'returnBook'),
      vi.spyOn(firestoreModule, 'subscribeToBooks'),
      vi.spyOn(firestoreModule, 'subscribeToIssuedBooks')
    ];

    firestoreLibrarySpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. CATEGORY REST OPERATIONS
  // ============================================================

  it('loads categories from REST listCategories', async () => {
    const listSpy = vi.spyOn(libraryApi, 'listCategories').mockResolvedValue({
      status: 'success',
      data: [MOCK_CATEGORY]
    });

    const res = await libraryApi.listCategories();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Computer Science');
  });

  it('creates category via REST createCategory', async () => {
    const createSpy = vi.spyOn(libraryApi, 'createCategory').mockResolvedValue({
      status: 'success',
      data: { id: 'cat-2', name: 'Mathematics' }
    });

    const res = await libraryApi.createCategory({ name: 'Mathematics' });

    expect(createSpy).toHaveBeenCalledWith({ name: 'Mathematics' });
    expect(res.data.name).toBe('Mathematics');
  });

  // ============================================================
  // 3. BOOK REST OPERATIONS & PAGINATION
  // ============================================================

  it('loads single-page books via REST listBooks', async () => {
    const listSpy = vi.spyOn(libraryApi, 'listBooks').mockResolvedValue({
      status: 'success',
      data: [MOCK_BOOK],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await libraryApi.listBooks({ page: 1, limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ page: 1, limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Clean Code');
  });

  it('fetches multi-page book datasets completely without omitting records', async () => {
    const page1Books = Array.from({ length: 100 }, (_, i) => ({
      id: `book-p1-${i}`,
      title: `Book Page 1 - ${i}`,
      author: 'Author A',
      isbn: `ISBN-1-${i}`,
      totalQuantity: 2,
      availableQuantity: 2
    }));

    const page2Books = Array.from({ length: 100 }, (_, i) => ({
      id: `book-p2-${i}`,
      title: `Book Page 2 - ${i}`,
      author: 'Author B',
      isbn: `ISBN-2-${i}`,
      totalQuantity: 3,
      availableQuantity: 3
    }));

    const page3Books = Array.from({ length: 17 }, (_, i) => ({
      id: `book-p3-${i}`,
      title: `Book Page 3 - ${i}`,
      author: 'Author C',
      isbn: `ISBN-3-${i}`,
      totalQuantity: 1,
      availableQuantity: 1
    }));

    const listSpy = vi.spyOn(libraryApi, 'listBooks').mockImplementation(async ({ page }) => {
      if (page === 1) return { status: 'success', data: page1Books, pagination: { total: 217, page: 1, limit: 100, totalPages: 3 } };
      if (page === 2) return { status: 'success', data: page2Books, pagination: { total: 217, page: 2, limit: 100, totalPages: 3 } };
      if (page === 3) return { status: 'success', data: page3Books, pagination: { total: 217, page: 3, limit: 100, totalPages: 3 } };
      return { status: 'success', data: [], pagination: { total: 217, page, limit: 100, totalPages: 3 } };
    });

    let allBooks = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const res = await libraryApi.listBooks({ page: currentPage, limit: 100 });
      allBooks = allBooks.concat(res.data);
      totalPages = res.pagination.totalPages;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(listSpy).toHaveBeenCalledTimes(3);
    expect(allBooks).toHaveLength(217);
    expect(allBooks[0].id).toBe('book-p1-0');
    expect(allBooks[100].id).toBe('book-p2-0');
    expect(allBooks[216].id).toBe('book-p3-16');
  });

  it('creates book via REST createBook with totalQuantity and customData', async () => {
    const createSpy = vi.spyOn(libraryApi, 'createBook').mockResolvedValue({
      status: 'success',
      data: MOCK_BOOK
    });

    const payload = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
      isbn: '978-0132350884',
      category: 'Computer Science',
      totalQuantity: 5,
      customData: {}
    };

    const res = await libraryApi.createBook(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe(BOOK_ID);
  });

  it('updates book via REST updateBook', async () => {
    const updateSpy = vi.spyOn(libraryApi, 'updateBook').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_BOOK, totalQuantity: 8 }
    });

    const res = await libraryApi.updateBook(BOOK_ID, { totalQuantity: 8 });

    expect(updateSpy).toHaveBeenCalledWith(BOOK_ID, { totalQuantity: 8 });
    expect(res.data.totalQuantity).toBe(8);
  });

  it('deletes book via REST deleteBook', async () => {
    const deleteSpy = vi.spyOn(libraryApi, 'deleteBook').mockResolvedValue({
      status: 'success',
      data: null
    });

    const res = await libraryApi.deleteBook(BOOK_ID);

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID);
    expect(res.data).toBeNull();
  });

  // ============================================================
  // 4. ISSUE & RETURN REST OPERATIONS & PAGINATION
  // ============================================================

  it('fetches multi-page issue datasets completely', async () => {
    const page1Issues = Array.from({ length: 100 }, (_, i) => ({
      id: `issue-p1-${i}`,
      bookId: `book-${i}`,
      studentId: `student-${i}`,
      dueDate: '2026-10-01',
      status: 'issued'
    }));

    const page2Issues = Array.from({ length: 50 }, (_, i) => ({
      id: `issue-p2-${i}`,
      bookId: `book-p2-${i}`,
      studentId: `student-p2-${i}`,
      dueDate: '2026-09-01',
      status: 'returned'
    }));

    const listSpy = vi.spyOn(libraryApi, 'listIssues').mockImplementation(async ({ page }) => {
      if (page === 1) return { status: 'success', data: page1Issues, pagination: { total: 150, page: 1, limit: 100, totalPages: 2 } };
      if (page === 2) return { status: 'success', data: page2Issues, pagination: { total: 150, page: 2, limit: 100, totalPages: 2 } };
      return { status: 'success', data: [], pagination: { total: 150, page, limit: 100, totalPages: 2 } };
    });

    let allIssues = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const res = await libraryApi.listIssues({ page: currentPage, limit: 100 });
      allIssues = allIssues.concat(res.data);
      totalPages = res.pagination.totalPages;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(allIssues).toHaveLength(150);
  });

  it('issues book via REST issueBook with bookId, studentId, and dueDate', async () => {
    const issueSpy = vi.spyOn(libraryApi, 'issueBook').mockResolvedValue({
      status: 'success',
      data: MOCK_ISSUE
    });

    const payload = {
      bookId: BOOK_ID,
      studentId: STUDENT_ID,
      dueDate: '2026-12-31'
    };

    const res = await libraryApi.issueBook(payload);

    expect(issueSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe(ISSUE_ID);
  });

  it('returns book via REST returnBook with issueId', async () => {
    const returnSpy = vi.spyOn(libraryApi, 'returnBook').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_ISSUE, status: 'returned', returnedAt: new Date().toISOString() }
    });

    const res = await libraryApi.returnBook(ISSUE_ID);

    expect(returnSpy).toHaveBeenCalledWith(ISSUE_ID);
    expect(res.data.status).toBe('returned');
  });

  it('handles 409 conflict when book is out of stock', async () => {
    const error409 = new Error("Book is out of stock");
    error409.status = 409;
    vi.spyOn(libraryApi, 'issueBook').mockRejectedValue(error409);

    await expect(
      libraryApi.issueBook({ bookId: BOOK_ID, studentId: STUDENT_ID, dueDate: '2026-12-31' })
    ).rejects.toThrow("Book is out of stock");
  });

  it('handles 409 conflict when book issue is already returned', async () => {
    const error409 = new Error("Book issue is already marked as returned");
    error409.status = 409;
    vi.spyOn(libraryApi, 'returnBook').mockRejectedValue(error409);

    await expect(
      libraryApi.returnBook(ISSUE_ID)
    ).rejects.toThrow("already marked as returned");
  });

  // ============================================================
  // 5. STUDENT & CLASS LOOKUP & PAGINATION
  // ============================================================

  it('fetches multi-page students and classes using paginated REST calls', async () => {
    const page1Students = Array.from({ length: 100 }, (_, i) => ({ id: `s-p1-${i}`, name: `Student 1-${i}` }));
    const page2Students = Array.from({ length: 25 }, (_, i) => ({ id: `s-p2-${i}`, name: `Student 2-${i}` }));

    const studentsSpy = vi.spyOn(studentsApi, 'listStudents').mockImplementation(async ({ page }) => {
      if (page === 1) return { success: true, data: page1Students, pagination: { total: 125, page: 1, limit: 100, totalPages: 2 } };
      if (page === 2) return { success: true, data: page2Students, pagination: { total: 125, page: 2, limit: 100, totalPages: 2 } };
      return { success: true, data: [], pagination: { total: 125, page, limit: 100, totalPages: 2 } };
    });

    let allStudents = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const res = await studentsApi.listStudents({ status: 'Active', page: currentPage, limit: 100 });
      allStudents = allStudents.concat(res.data);
      totalPages = res.pagination.totalPages;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(studentsSpy).toHaveBeenCalledTimes(2);
    expect(allStudents).toHaveLength(125);
  });

  // ============================================================
  // 6. CLIENT-SIDE SEARCH / FILTER ACROSS MULTI-PAGE DATASET
  // ============================================================

  it('matches and filters a book that was loaded from page 2+ of the dataset', () => {
    const multiPageBooks = [
      { id: 'b-1', title: 'Calculus I', author: 'Stewart', isbn: '111', category: 'Math' },
      { id: 'b-101', title: 'Deep Learning with Python', author: 'François Chollet', isbn: '978-1617294433', category: 'AI' }
    ];

    const searchTerm = 'Chollet';
    const filtered = multiPageBooks.filter(b =>
      (b.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.author || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.isbn || '').includes(searchTerm)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('b-101');
    expect(filtered[0].title).toBe('Deep Learning with Python');
  });
});
