import React, { useState, useEffect } from 'react';
import { listTenants } from '../../api/superadmin';
import { Link } from 'react-router-dom';
import { LuBuilding2 as Building2, LuSearch as Search, LuFilter as Filter, LuCircleCheck as CheckCircle2, LuCircleX as XCircle, LuClock as Clock, LuCircleAlert as AlertCircle } from 'react-icons/lu';

export default function TenantsList() {
  const [schools, setSchools] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    let isMounted = true;
    const fetchTenants = async () => {
      setLoading(true);
      try {
        const queryParams = {
          page: currentPage,
          limit: itemsPerPage
        };
        if (filterStatus !== 'all') {
          queryParams.status = filterStatus;
        }
        if (searchQuery.trim()) {
          queryParams.search = searchQuery.trim();
        }

        const res = await listTenants(queryParams);
        if (!isMounted) return;

        const rawList = res?.data?.tenants || (Array.isArray(res?.data) ? res.data : []);
        const pagination = res?.data?.pagination || res?.pagination || {};

        setSchools(rawList);
        setTotalCount(pagination.total ?? rawList.length);
      } catch (err) {
        console.error('Error fetching tenants from REST API:', err);
        if (isMounted) {
          setSchools([]);
          setTotalCount(0);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTenants();
    return () => {
      isMounted = false;
    };
  }, [filterStatus, searchQuery, currentPage]);

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'approved':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"><CheckCircle2 size={14} /> Active</span>;
      case 'pending':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"><Clock size={14} /> Pending</span>;
      case 'suspended':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"><AlertCircle size={14} /> Suspended</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"><XCircle size={14} /> Rejected</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100">{status}</span>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;

  return (
    <div className="p-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Tenant Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and monitor all school workspaces.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={18} />
            <input 
              type="text" 
              placeholder="Search by school name or email..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-3">
            <Filter size={18} className="text-slate-400 dark:text-slate-300" />
            <select 
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Active (Approved)</option>
              <option value="pending">Pending Review</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="p-4 pl-6">School Name</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4">Registration Date</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                    </div>
                  </td>
                </tr>
              ) : schools.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500 dark:text-slate-400">
                    No schools found matching your criteria.
                  </td>
                </tr>
              ) : (
                schools.map((school) => {
                  const displayName = school.name || school.schoolName || 'Unnamed School';
                  const email = school.email || school.contactEmail || 'N/A';
                  const phone = school.phone || school.contactPhone || 'No phone';
                  const location = school.address || school.location || 'Not specified';
                  return (
                    <tr key={school.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-semibold text-slate-900 dark:text-white">{displayName}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-mono">ID: {school.id?.slice(0, 8)}...</div>
                      </td>
                      <td className="p-4">
                        <div className="text-slate-900 dark:text-white">{email}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{phone}</div>
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-200">
                        {location}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(school.status)}
                      </td>
                      <td className="p-4 text-slate-500 dark:text-slate-400">
                        {school.createdAt ? new Date(school.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Link 
                          to={`/superadmin/tenants/${school.id}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Showing <span className="font-semibold text-slate-900 dark:text-white">{startIndex + 1}</span> to{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {Math.min(startIndex + itemsPerPage, totalCount)}
              </span>{' '}
              of <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> tenants
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-9 w-9 flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
                      currentPage === pageNum
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
