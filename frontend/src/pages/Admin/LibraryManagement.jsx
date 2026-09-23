import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listBooks,
  createBook,
  listCategories,
  createCategory,
  listIssues,
  issueBook,
  returnBook
} from '../../api/library';
import { listStudents } from '../../api/students';
import { listClasses } from '../../api/classes';
import { LuBook as Book, LuPlus as Plus, LuX as X, LuSearch as Search, LuCircleCheck as CheckCircle2, LuCircleAlert as AlertCircle, LuLibrary as Library, LuUndo2 as Undo2, LuUsers as Users } from 'react-icons/lu';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';
import CustomFieldsRenderer from '../../components/CustomFieldsRenderer';
import { uploadCustomDataFiles } from '../../utils/cloudinary';
import usePermissions from '../../hooks/usePermissions';
import { sortClassesAscending } from '../../utils/classSorting';

const DEFAULT_CATEGORIES = [
  'General'
];

/**
 * Safely fetches all pages of a paginated API endpoint to ensure complete client-side datasets.
 *
 * @param {Function} fetchFn - API function returning { data: Array, pagination: Object }
 * @param {Object} [query={}] - Optional query filters
 * @param {number} [limit=100] - Page size limit
 * @returns {Promise<Array<Object>>} Combined flat array of all records
 */
async function fetchAllPages(fetchFn, query = {}, limit = 100) {
  let allItems = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const res = await fetchFn({ ...query, page: currentPage, limit });
    const pageData = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    allItems = allItems.concat(pageData);

    const pagination = res?.pagination;
    totalPages = typeof pagination?.totalPages === 'number' ? pagination.totalPages : 1;
    currentPage += 1;

    // Safety guard against infinite loops
    if (currentPage > 200) break;
  } while (currentPage <= totalPages);

  return allItems;
}

export default function LibraryManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;

  const { canCreate, canEdit, canDelete } = usePermissions();
  const role = userProfile?.role?.toLowerCase();
  const isPrivilegedRole = role === 'admin' || role === 'superadmin' || role === 'library';
  const hasCreatePermission = isPrivilegedRole || canCreate('library');
  const hasEditPermission = isPrivilegedRole || canEdit('library');
  const _hasDeletePermission = isPrivilegedRole || canDelete('library');

  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'issued'
  const [books, setBooks] = useState([]);
  const [issuedBooks, setIssuedBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search/Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [confirmModalState, setConfirmModalState] = useState({ isOpen: false, issueId: null, bookId: null });
  
  // Forms
  const [addingBook, setAddingBook] = useState(false);
  const [newBook, setNewBook] = useState({
    title: '', author: '', isbn: '', category: '', totalQuantity: 1, customData: {}
  });

  const [issuingBook, setIssuingBook] = useState(false);
  const [issueData, setIssueData] = useState({
    bookId: '', classId: '', studentId: '', dueDate: ''
  });

  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories])).sort();

  const filteredStudentsForIssue = issueData.classId
    ? students.filter(s => 
        s.classId === issueData.classId ||
        s.class === issueData.classId ||
        (classes.find(c => c.id === issueData.classId) && 
          (s.className === `${classes.find(c => c.id === issueData.classId).name} - Section ${classes.find(c => c.id === issueData.classId).section}` ||
           s.class === classes.find(c => c.id === issueData.classId).name))
      )
    : students;

  const loadLibraryData = React.useCallback(async () => {
    if (!schoolId) return;

    setLoading(true);
    try {
      const [allBooks, allIssues, categoriesRes, allStudents, allClasses] = await Promise.allSettled([
        fetchAllPages(listBooks, {}, 100),
        fetchAllPages(listIssues, {}, 100),
        listCategories(),
        fetchAllPages(listStudents, { status: 'Active' }, 100),
        fetchAllPages(listClasses, {}, 100)
      ]);

      if (allBooks.status === 'fulfilled' && Array.isArray(allBooks.value)) {
        setBooks(allBooks.value);
      } else {
        setBooks([]);
      }

      if (allIssues.status === 'fulfilled' && Array.isArray(allIssues.value)) {
        setIssuedBooks(allIssues.value);
      } else {
        setIssuedBooks([]);
      }

      if (categoriesRes.status === 'fulfilled' && categoriesRes.value?.data) {
        setCustomCategories(categoriesRes.value.data.map(item => item.name || item.category).filter(Boolean));
      }

      if (allStudents.status === 'fulfilled' && Array.isArray(allStudents.value)) {
        setStudents(allStudents.value);
      }

      if (allClasses.status === 'fulfilled' && Array.isArray(allClasses.value)) {
        setClasses(sortClassesAscending(allClasses.value));
      }
    } catch (err) {
      console.error("Failed to load library data:", err);
      toast.error("Failed to load library data");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadLibraryData();
  }, [loadLibraryData]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Please enter a category name.");
      return;
    }

    setSavingCategory(true);
    try {
      const res = await createCategory({ name: trimmed });
      const createdCatName = res?.data?.name || trimmed;
      setCustomCategories(prev => Array.from(new Set([...prev, createdCatName])));
      setNewBook(prev => ({ ...prev, category: createdCatName }));
      toast.success(`Category "${createdCatName}" added!`);
      setShowAddCategoryModal(false);
      setNewCategoryName('');
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add category");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleAddBook = async (e) => {
    e.preventDefault();
    if (!hasCreatePermission) {
      toast.error("You do not have permission to add books.");
      return;
    }
    setAddingBook(true);
    try {
      const uploadedCustomData = await uploadCustomDataFiles(newBook.customData, schoolId, 'library');
      await createBook({
        title: newBook.title.trim(),
        author: newBook.author?.trim() || undefined,
        isbn: newBook.isbn?.trim() || undefined,
        category: newBook.category || undefined,
        totalQuantity: Number(newBook.totalQuantity) || 1,
        customData: uploadedCustomData
      });
      toast.success("Book added to catalog!");
      setShowAddModal(false);
      setNewBook({ title: '', author: '', isbn: '', category: '', totalQuantity: 1, customData: {} });
      
      // Refresh books and categories
      const [updatedBooks, categoriesRes] = await Promise.all([
        fetchAllPages(listBooks, {}, 100),
        listCategories()
      ]);
      if (Array.isArray(updatedBooks)) setBooks(updatedBooks);
      if (categoriesRes?.data) setCustomCategories(categoriesRes.data.map(item => item.name || item.category).filter(Boolean));
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to add book");
    } finally {
      setAddingBook(false);
    }
  };

  const handleIssueBook = async (e) => {
    e.preventDefault();
    if (!hasEditPermission) {
      toast.error("You do not have permission to issue books.");
      return;
    }
    if (!issueData.bookId || !issueData.studentId || !issueData.dueDate) return;

    // Check if available locally first
    const book = books.find(b => b.id === issueData.bookId);
    if (!book || book.availableQuantity <= 0) {
      toast.error("This book is out of stock!");
      return;
    }

    setIssuingBook(true);
    try {
      await issueBook({
        bookId: issueData.bookId,
        studentId: issueData.studentId,
        dueDate: issueData.dueDate
      });
      toast.success("Book issued successfully!");
      setShowIssueModal(false);
      setIssueData({ bookId: '', classId: '', studentId: '', dueDate: '' });
      setActiveTab('issued');

      // Refresh books and issues
      const [updatedBooks, updatedIssues] = await Promise.all([
        fetchAllPages(listBooks, {}, 100),
        fetchAllPages(listIssues, {}, 100)
      ]);
      if (Array.isArray(updatedBooks)) setBooks(updatedBooks);
      if (Array.isArray(updatedIssues)) setIssuedBooks(updatedIssues);
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to issue book");
    } finally {
      setIssuingBook(false);
    }
  };

  const handleReturnBookClick = (issueId, bookId) => {
    if (!hasEditPermission) {
      toast.error("You do not have permission to return books.");
      return;
    }
    setConfirmModalState({ isOpen: true, issueId, bookId });
  };

  const executeReturnBook = async () => {
    if (!hasEditPermission) {
      toast.error("You do not have permission to return books.");
      return;
    }
    const { issueId } = confirmModalState;
    if (!issueId) return;
    try {
      await returnBook(issueId);
      toast.success("Book marked as returned!");
      // Refresh books and issues
      const [updatedBooks, updatedIssues] = await Promise.all([
        fetchAllPages(listBooks, {}, 100),
        fetchAllPages(listIssues, {}, 100)
      ]);
      if (Array.isArray(updatedBooks)) setBooks(updatedBooks);
      if (Array.isArray(updatedIssues)) setIssuedBooks(updatedIssues);
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to return book");
    } finally {
      setConfirmModalState({ isOpen: false, issueId: null, bookId: null });
    }
  };

  const getStudentName = (studentId, issueStudent) => {
    if (issueStudent?.name) {
      return issueStudent.admissionNumber ? `${issueStudent.name} (${issueStudent.admissionNumber})` : issueStudent.name;
    }
    const s = students.find(s => s.id === studentId);
    if (!s) return 'Unknown Student';
    const name = s.firstName ? `${s.firstName} ${s.lastName || ''}`.trim() : (s.name || 'Unknown Student');
    return s.admissionNumber ? `${name} (${s.admissionNumber})` : name;
  };

  const getBookTitle = (bookId, issueBookObj) => {
    if (issueBookObj?.title) return issueBookObj.title;
    const b = books.find(b => b.id === bookId);
    return b ? b.title : 'Unknown Book';
  };

  const isOverdue = (dueDate, issueOverdue) => {
    if (typeof issueOverdue === 'boolean') return issueOverdue;
    return new Date(dueDate) < new Date();
  };

  // Filtered Lists
  const filteredBooks = books.filter(b =>
    (b.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.author || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.isbn || '').includes(searchTerm)
  );

  const filteredIssued = issuedBooks.filter(issue =>
    getBookTitle(issue.bookId, issue.book).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getStudentName(issue.studentId, issue.student).toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto min-w-0 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Library Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage book inventory, issuing, and returns.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
          {hasEditPermission && (
            <button
              onClick={() => setShowIssueModal(true)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm flex items-center justify-center gap-2 transition-colors flex-1 sm:flex-none"
            >
              <Library size={18} /> Issue Book
            </button>
          )}
          {hasCreatePermission && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 shadow-sm flex items-center justify-center gap-2 transition-colors flex-1 sm:flex-none"
            >
              <Plus size={18} /> Add New Book
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col min-h-[500px]">
        {/* Header Tabs & Search */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-800 rounded-t-3xl">
          <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'inventory' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Book Inventory ({books.length})
            </button>
            <button
              onClick={() => setActiveTab('issued')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'issued' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Issued Logs ({issuedBooks.filter(i => i.status === 'issued').length})
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={18} />
            <input
              type="text"
              placeholder="Search books or students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-x-auto w-full min-w-0">
          {activeTab === 'inventory' ? (
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                  <th className="p-4 font-semibold w-2/5">Book Details</th>
                  <th className="p-4 font-semibold">Category</th>
                  <th className="p-4 font-semibold">ISBN</th>
                  <th className="p-4 font-semibold text-right">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBooks.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-12 text-center text-slate-500 dark:text-slate-400">No books found.</td>
                  </tr>
                ) : (
                  filteredBooks.map(book => {
                    const isEmpty = book.availableQuantity === 0;
                    const percentage = book.totalQuantity > 0 ? (book.availableQuantity / book.totalQuantity) * 100 : 0;
                    return (
                      <tr key={book.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 rounded-xl flex items-center justify-center shrink-0">
                              <Book size={20} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">{book.title}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">by {book.author || 'Unknown'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider">
                            {book.category || 'General'}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-sm text-slate-500 dark:text-slate-400">{book.isbn || '—'}</td>
                        <td className="p-4">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${isEmpty ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                {book.availableQuantity} / {book.totalQuantity}
                              </span>
                            </div>
                            <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isEmpty ? 'bg-red-500' : percentage > 50 ? 'bg-green-500' : 'bg-amber-500'}`}
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                  <th className="p-4 font-semibold w-1/3">Book</th>
                  <th className="p-4 font-semibold w-1/3">Issued To</th>
                  <th className="p-4 font-semibold">Due Date</th>
                  <th className="p-4 font-semibold text-right">Status / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIssued.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-12 text-center text-slate-500 dark:text-slate-400">No issued logs found.</td>
                  </tr>
                ) : (
                  filteredIssued.map(issue => {
                    const overdue = isOverdue(issue.dueDate, issue.overdue);
                    return (
                      <tr key={issue.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          {getBookTitle(issue.bookId, issue.book)}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 font-medium">
                            <Users size={14} className="text-slate-400 dark:text-slate-300" />
                            {getStudentName(issue.studentId, issue.student)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className={`flex items-center gap-1.5 text-sm font-medium ${overdue ? 'text-red-600' : 'text-slate-600 dark:text-slate-300'}`}>
                            {overdue && <AlertCircle size={14} />}
                            {new Date(issue.dueDate).toLocaleDateString('en-GB')}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          {issue.status === 'returned' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 size={14} /> Returned
                            </span>
                          ) : (
                            hasEditPermission && (
                              <button
                                onClick={() => handleReturnBookClick(issue.id, issue.bookId)}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
                              >
                                <Undo2 size={14} /> Mark Returned
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Book Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Book className="text-primary-600" /> Catalog New Book
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddBook} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Book Title</label>
                    <input
                      type="text" required
                      value={newBook.title}
                      onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Author</label>
                    <input
                      type="text" required
                      value={newBook.author}
                      onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">ISBN</label>
                    <input
                      type="text" required
                      value={newBook.isbn}
                      onChange={(e) => setNewBook({ ...newBook, isbn: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Category</label>
                    <select
                      required
                      value={newBook.category}
                      onChange={(e) => {
                        if (e.target.value === 'ADD_NEW') {
                          setShowAddCategoryModal(true);
                        } else {
                          setNewBook({ ...newBook, category: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200"
                    >
                      <option value="">Select Category...</option>
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="ADD_NEW" className="font-semibold text-primary-600">+ Add New Category...</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Total Copies</label>
                  <input
                    type="number" min="1" required
                    value={newBook.totalQuantity}
                    onChange={(e) => setNewBook({ ...newBook, totalQuantity: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 mt-6">
                  <CustomFieldsRenderer
                    moduleKey="library"
                    customData={newBook.customData}
                    onChange={(k, v) => setNewBook(prev => ({ ...prev, customData: { ...(prev.customData || {}), [k]: v } }))}
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={addingBook} className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl shadow-sm transition-colors">
                  {addingBook ? 'Cataloging...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add New Library Category</h2>
              <button onClick={() => setShowAddCategoryModal(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Biography & Memoir"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-medium"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingCategory ? 'Saving...' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Book Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Library className="text-primary-600" /> Issue Book
              </h2>
              <button onClick={() => setShowIssueModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleIssueBook} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Book</label>
                    <select
                      required
                      value={issueData.bookId}
                      onChange={(e) => setIssueData({ ...issueData, bookId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200"
                    >
                      <option value="">Choose an available book...</option>
                      {books.filter(b => b.availableQuantity > 0).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title} (Available: {b.availableQuantity})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Class</label>
                      <select
                        value={issueData.classId}
                        onChange={(e) => setIssueData({ ...issueData, classId: e.target.value, studentId: '' })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200"
                      >
                        <option value="">All Classes / Select Class...</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} - Section {c.section}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Student</label>
                      <select
                        required
                        value={issueData.studentId}
                        onChange={(e) => setIssueData({ ...issueData, studentId: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200"
                      >
                        <option value="">
                          {issueData.classId ? "Choose a student from this class..." : "Choose a student..."}
                        </option>
                        {filteredStudentsForIssue.map(s => {
                          const displayName = s.firstName ? `${s.firstName} ${s.lastName || ''}`.trim() : (s.name || 'Student');
                          const admInfo = s.admissionNumber ? ` (${s.admissionNumber})` : '';
                          return (
                            <option key={s.id} value={s.id}>
                              {displayName}{admInfo}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Due Date</label>
                  <input
                    type="date" required
                    value={issueData.dueDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setIssueData({ ...issueData, dueDate: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setShowIssueModal(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={issuingBook} className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl shadow-sm transition-colors">
                  {issuingBook ? 'Processing...' : 'Issue Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ isOpen: false, issueId: null, bookId: null })}
        onConfirm={executeReturnBook}
        title="Return Book"
        message="Mark this book as returned? This will update the inventory and the student's record."
        confirmText="Confirm"
        type="primary"
      />
    </div>
  );
}
