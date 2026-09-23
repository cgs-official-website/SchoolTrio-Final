import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyChildren, linkChild } from '../api/parents';
import { getStudentInvoices } from '../api/invoices';
import TopNavbar from '../components/TopNavbar';
import { LuCircleUser as UserCircle, LuLogOut as LogOut, LuSquareCheck as CheckSquare, LuGraduationCap as GraduationCap, LuCreditCard as CreditCard, LuLink as LinkIcon, LuBell as Bell, LuX as X, LuFileText as FileText, LuCalendar as Calendar, LuCoffee as Coffee, LuTrendingUp as TrendingUp, LuCalendarClock as CalendarClock, LuMessageSquare as MessageSquare, LuUsers as Users, LuChevronDown as ChevronDown, LuPlus as Plus } from 'react-icons/lu';
import useSchoolBranding from '../hooks/useSchoolBranding';
import { useNotifications } from '../context/NotificationContext';

const getStoredActiveStudentId = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('sms_active_student_id') : null;
  } catch {
    return null;
  }
};

const setStoredActiveStudentId = (id) => {
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) {
        localStorage.setItem('sms_active_student_id', id);
      } else {
        localStorage.removeItem('sms_active_student_id');
      }
    }
  } catch {}
};

const NAV_ITEMS = [
  { name: 'Student Overview', path: '/parent', icon: UserCircle, exact: true },
  { name: 'My Children', path: '/parent/children', icon: Users },
  { name: 'Performance', path: '/parent/performance', icon: TrendingUp },
  { name: 'PTM Meetings', path: '/parent/ptm', icon: CalendarClock },
  { name: 'Noticeboard', path: '/parent/notices', icon: Bell, moduleKey: 'noticeboard' },
  { name: 'Calendar', path: '/parent/calendar', icon: Calendar },
  { name: 'Attendance', path: '/parent/attendance', icon: CheckSquare },
  { name: 'Canteen', path: '/parent/canteen', icon: Coffee },
  { name: 'Homework', path: '/parent/homework', icon: FileText, moduleKey: 'homework' },
  { name: 'Report Card', path: '/parent/grades', icon: GraduationCap },
  { name: 'Fees & Payments', path: '/parent/fees', icon: CreditCard, moduleKey: 'fees' },
  { name: 'Leave Requests', path: '/parent/leaves', icon: Calendar },
  { name: 'Messages', path: '/parent/chat', icon: MessageSquare, moduleKey: 'chats' }
];

export default function ParentDashboard() {
  const { userProfile, logoutUser } = useAuth();
  const { unreadCounts, clearBadge } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const mountedRef = useRef(true);
  const currentActiveStudentRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [enrolledChildren, setEnrolledChildren] = useState([]);
  const [activeStudentId, setActiveStudentId] = useState(() => getStoredActiveStudentId());

  const [school, setSchool] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [unpaidFeeCount, setUnpaidFeeCount] = useState(0);
  const [hasOverdueFees, setHasOverdueFees] = useState(false);

  // Link Student Form State
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState('Child');
  const [linkingError, setLinkingError] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Multiple Children State
  const [isChildDropdownOpen, setIsChildDropdownOpen] = useState(false);
  const [isLinkAnotherModalOpen, setIsLinkAnotherModalOpen] = useState(false);
  const [anotherAdmission, setAnotherAdmission] = useState('');
  const [anotherDob, setAnotherDob] = useState('');
  const [anotherRelationship, setAnotherRelationship] = useState('Child');
  const [anotherError, setAnotherError] = useState('');
  const [isLinkingAnother, setIsLinkingAnother] = useState(false);

  // Apply dynamic title and favicon
  useSchoolBranding(school);

  // Keep ref synchronized with activeStudentId
  useEffect(() => {
    currentActiveStudentRef.current = activeStudentId;
  }, [activeStudentId]);

  // 1. Authoritative REST Loader for Enrolled Children
  const loadChildren = useCallback(async () => {
    try {
      setLoadingChildren(true);
      const res = await getMyChildren();
      if (!mountedRef.current) return;

      const links = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const mapped = links.map(link => {
        const st = link.student || {};
        const firstName = st.firstName || '';
        const lastName = st.lastName || '';
        const fullName = (firstName + ' ' + lastName).trim() || st.name || 'Student';
        return {
          ...st,
          id: st.id,
          studentId: st.id,
          name: fullName,
          linkId: link.id,
          relationship: link.relationship,
          class: st.class,
          section: st.section,
          classId: st.classId || st.class?.id
        };
      });

      setEnrolledChildren(mapped);

      // Reconcile active student against authoritative list
      setActiveStudentId(prevActiveId => {
        const storedId = getStoredActiveStudentId();
        const candidateId = storedId || prevActiveId;
        const isValid = candidateId && mapped.some(c => c.id === candidateId);

        if (isValid) {
          setStoredActiveStudentId(candidateId);
          return candidateId;
        }
        const fallbackId = mapped[0]?.id || null;
        setStoredActiveStudentId(fallbackId);
        return fallbackId;
      });
    } catch (err) {
      console.error('[ParentDashboard] Error loading enrolled children:', err);
      if (mountedRef.current) {
        setEnrolledChildren([]);
        setActiveStudentId(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingChildren(false);
      }
    }
  }, []);

  // Initial Load & Lifecycle Guard
  useEffect(() => {
    mountedRef.current = true;
    loadChildren();
    return () => {
      mountedRef.current = false;
    };
  }, [loadChildren]);

  // School Branding from REST auth userProfile
  useEffect(() => {
    if (userProfile && userProfile.role !== 'parent') {
      navigate('/');
    } else {
      if (userProfile?.schoolName) {
        setSchool({
          name: userProfile.schoolName,
          schoolName: userProfile.schoolName,
          code: userProfile.schoolCode,
          branding: {
            logoUrl: null
          }
        });
      }
      setLoading(false);
    }
  }, [userProfile, navigate]);

  // Fetch unpaid invoices and overdue status for active student from PostgreSQL REST
  const fetchFeeBadge = useCallback(async (targetStudentId) => {
    if (!targetStudentId) {
      setUnpaidFeeCount(0);
      setHasOverdueFees(false);
      return;
    }

    try {
      const res = await getStudentInvoices(targetStudentId, { limit: 1 });
      if (!mountedRef.current || currentActiveStudentRef.current !== targetStudentId) return;

      const summary = res?.summary || {};
      const unpaid = Number(summary.unpaidCount) || 0;
      const overdue = (Number(summary.overdueCount) || 0) > 0;

      setUnpaidFeeCount(unpaid);
      setHasOverdueFees(overdue);
    } catch (err) {
      if (mountedRef.current && currentActiveStudentRef.current === targetStudentId) {
        console.error('[ParentDashboard] Error fetching fee summary for badge:', err);
      }
    }
  }, []);

  // Refresh fee badge whenever activeStudentId changes
  useEffect(() => {
    if (activeStudentId) {
      fetchFeeBadge(activeStudentId);
    } else {
      setUnpaidFeeCount(0);
      setHasOverdueFees(false);
    }
  }, [activeStudentId, fetchFeeBadge]);

  // Listen for payment events to refresh badge immediately
  useEffect(() => {
    const handleInvoicePaid = (e) => {
      const paidStudentId = e.detail?.studentId;
      if (!paidStudentId || paidStudentId === currentActiveStudentRef.current) {
        fetchFeeBadge(currentActiveStudentRef.current);
      }
    };

    window.addEventListener('sms:invoice-paid', handleInvoicePaid);
    return () => {
      window.removeEventListener('sms:invoice-paid', handleInvoicePaid);
    };
  }, [fetchFeeBadge]);

  // Close sidebar on route change for mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const matchedItem = NAV_ITEMS.find(item => 
      location.pathname === item.path || 
      (item.path !== '/parent' && item.path !== '/' && location.pathname.startsWith(item.path))
    );
    if (matchedItem && matchedItem.moduleKey) {
      clearBadge(matchedItem.moduleKey);
    }
  }, [location.pathname, clearBadge]);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  const handleLinkStudent = async (e) => {
    e.preventDefault();
    setLinkingError('');
    setIsLinking(true);

    try {
      await linkChild({
        admissionNumber: admissionNumber.trim(),
        dob: dob.trim(),
        relationship: relationship.trim() || 'Child'
      });
      
      await loadChildren();
      setAdmissionNumber('');
      setDob('');
    } catch (error) {
      console.error("Link error:", error);
      let msg = "An error occurred while linking. Please try again.";
      if (error?.status === 404 || error?.message?.toLowerCase().includes('not found')) {
        msg = "No student found matching this Admission Number and Date of Birth.";
      } else if (error?.status === 409 || error?.message?.toLowerCase().includes('already linked')) {
        msg = "This student is already linked to your account.";
      } else if (error?.status === 400) {
        msg = error?.message || "Invalid admission number or date of birth.";
      } else if (error?.status === 403) {
        msg = "You are not authorized to link this student.";
      } else if (error?.message) {
        msg = error.message;
      }
      setLinkingError(msg);
    } finally {
      if (mountedRef.current) {
        setIsLinking(false);
      }
    }
  };

  const handleLinkAnotherChild = async (e) => {
    e.preventDefault();
    setAnotherError('');
    setIsLinkingAnother(true);

    try {
      await linkChild({
        admissionNumber: anotherAdmission.trim(),
        dob: anotherDob.trim(),
        relationship: anotherRelationship.trim() || 'Child'
      });
      
      await loadChildren();
      setIsLinkAnotherModalOpen(false);
      setIsChildDropdownOpen(false);
      setAnotherAdmission('');
      setAnotherDob('');
    } catch (error) {
      console.error("Link another child error:", error);
      let msg = "An error occurred while linking. Please try again.";
      if (error?.status === 404 || error?.message?.toLowerCase().includes('not found')) {
        msg = "No student found matching this Admission Number and Date of Birth.";
      } else if (error?.status === 409 || error?.message?.toLowerCase().includes('already linked')) {
        msg = "This student is already linked to your account.";
      } else if (error?.status === 400) {
        msg = error?.message || "Invalid admission number or date of birth.";
      } else if (error?.status === 403) {
        msg = "You are not authorized to link this student.";
      } else if (error?.message) {
        msg = error.message;
      }
      setAnotherError(msg);
    } finally {
      if (mountedRef.current) {
        setIsLinkingAnother(false);
      }
    }
  };

  const handleSwitchChild = (studentId) => {
    if (studentId === activeStudentId) {
      setIsChildDropdownOpen(false);
      return;
    }
    setActiveStudentId(studentId);
    setStoredActiveStudentId(studentId);
    setIsChildDropdownOpen(false);
  };

  const activeChild = enrolledChildren.find(s => s.id === activeStudentId) || enrolledChildren[0] || null;
  const activeChildName = activeChild?.name || 'Active Child';

  if (loading || loadingChildren) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex justify-center items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  // --- LOCK SCREEN: Link Student ---
  if (!loadingChildren && enrolledChildren.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-primary-500"></div>
          
          <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mb-6">
            <LinkIcon size={32} />
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Link Your Child</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">
            To view academic records, please securely link your account using your child's Admission Number and Date of Birth.
          </p>

          {linkingError && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-200">
              {linkingError}
            </div>
          )}

          <form onSubmit={handleLinkStudent} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Admission Number</label>
              <input 
                type="text" 
                required
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                placeholder="e.g. ADM-2024-001"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Date of Birth</label>
              <input 
                type="date" 
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Relationship</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white dark:bg-slate-900"
              >
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
                <option value="Child">Child</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={isLinking}
              className="w-full py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-xl font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
            >
              {isLinking ? 'Verifying...' : 'Link Account securely'}
            </button>
          </form>

          <button 
            onClick={handleLogout}
            className="w-full py-3 mt-4 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold transition-colors flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl"
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f4f7fe] dark:bg-[#0b0f19] font-sans overflow-hidden p-0 lg:p-4 gap-0 lg:gap-4">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 lg:inset-y-4 lg:left-4 z-50 w-64 bg-white dark:bg-slate-900 rounded-none lg:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[120%]'}
      `}>
        <div className="px-6 pb-6 pt-8 flex justify-between items-start">

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center p-1 shrink-0">
              <img src="/logo.png" alt="School" className="w-full h-full object-contain" onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='block'; }} />
              <div style={{display: 'none'}} className="font-black text-slate-900 dark:text-white text-xl">Z</div>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight truncate">Zuna</h2>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Parent Portal</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 p-1">
            <X size={24} />
          </button>
        </div>

        {/* Child Switcher Dropdown */}
        {enrolledChildren.length > 0 && (
          <div className="mb-4 relative px-4">
            <button 
              onClick={() => setIsChildDropdownOpen(!isChildDropdownOpen)}
              className="w-full flex items-center justify-between bg-primary-50 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-slate-700 text-primary-900 dark:text-primary-100 px-4 py-2.5 rounded-xl border border-primary-100 dark:border-slate-700 transition-colors"
            >
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">Viewing</span>
                <span className="text-sm font-bold truncate max-w-[150px]">{activeChildName}</span>
              </div>
              <ChevronDown size={16} className={`text-primary-600 transition-transform ${isChildDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isChildDropdownOpen && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-[0_10px_40px_rgb(0,0,0,0.1)] border border-slate-100 dark:border-slate-800 py-2 z-50 animate-fade-in">
                {enrolledChildren.map((child, idx) => (
                  <button
                    key={child.id || idx}
                    onClick={() => handleSwitchChild(child.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      child.id === activeStudentId 
                        ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-200 font-bold' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                      child.id === activeStudentId ? 'bg-primary-200 text-primary-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {child.name?.substring(0, 2).toUpperCase() || 'ST'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{child.name || 'Student'}</p>
                      {(child.class?.name || child.section?.name) && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {[child.class?.name, child.section?.name].filter(Boolean).join(' - ')}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                
                <div className="px-3 pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    onClick={() => {
                      setIsChildDropdownOpen(false);
                      setIsLinkAnotherModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Plus size={16} /> Link Another Child
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 font-semibold text-sm ${
                  isActive 
                    ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-900 dark:text-primary-100 shadow-md shadow-slate-900/20 dark:shadow-none' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary-500 rounded-r-md"></div>
                  )}
                  <item.icon size={20} className="shrink-0" />
                  <span>{item.name}</span>
                  {item.moduleKey === 'fees' && unpaidFeeCount > 0 ? (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full select-none shrink-0 ml-auto animate-pulse ${
                      hasOverdueFees 
                        ? 'bg-red-600 text-white shadow-sm shadow-red-500/50' 
                        : 'bg-amber-500 text-white shadow-sm shadow-amber-500/50'
                    }`}>
                      {hasOverdueFees ? `${unpaidFeeCount} Overdue` : `${unpaidFeeCount} Due`}
                    </span>
                  ) : item.moduleKey && unreadCounts[item.moduleKey] > 0 && !isActive ? (
                    <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full select-none shrink-0 ml-auto animate-pulse">
                      {unreadCounts[item.moduleKey]}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 shrink-0 mt-auto">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 flex items-center justify-between border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold shrink-0">
                {userProfile?.name ? userProfile.name.substring(0, 2).toUpperCase() : userProfile?.email?.substring(0, 2).toUpperCase() || 'PA'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{userProfile?.name || userProfile?.email?.split('@')[0]}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">{userProfile?.role || 'Parent'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 dark:text-slate-300 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden gap-4 relative">
        <TopNavbar 
          schoolName={school?.name || school?.schoolName || 'Parent Portal'} 
          schoolLogo={school?.branding?.logoUrl}
          toggleSidebar={() => setIsSidebarOpen(true)} 
          navItems={NAV_ITEMS}
        />
        
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <Suspense fallback={
            <div className="flex-1 flex justify-center items-center h-[50vh]">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
          }>
            <Outlet context={{ activeStudentId, activeChild, enrolledChildren, refreshChildren: loadChildren, refreshFeeBadge: () => fetchFeeBadge(activeStudentId) }} />
          </Suspense>
        </main>
      </div>

      {/* Link Another Child Modal */}
      {isLinkAnotherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Link Another Child</h3>
              <button 
                onClick={() => setIsLinkAnotherModalOpen(false)} 
                className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleLinkAnotherChild} className="p-6 space-y-4">
              {anotherError && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-200">
                  {anotherError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Admission Number <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  value={anotherAdmission}
                  onChange={(e) => setAnotherAdmission(e.target.value)}
                  placeholder="e.g. ADM-2024-001"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  required
                  value={anotherDob}
                  onChange={(e) => setAnotherDob(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Relationship</label>
                <select
                  value={anotherRelationship}
                  onChange={(e) => setAnotherRelationship(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white dark:bg-slate-900"
                >
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Child">Child</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsLinkAnotherModalOpen(false)}
                  className="px-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isLinkingAnother}
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 shadow-sm transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {isLinkingAnother ? 'Linking...' : 'Link Child'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

