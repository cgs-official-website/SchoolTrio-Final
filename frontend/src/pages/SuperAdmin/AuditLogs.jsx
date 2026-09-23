import React, { useState, useEffect, useCallback } from 'react';
import { LuClipboardList, LuSearch, LuDownload, LuUser } from 'react-icons/lu';
import { listSuperAdminAuditLogs } from '../../api/audit';
import toast from 'react-hot-toast';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: itemsPerPage
      };
      if (searchTerm.trim()) {
        params.action = searchTerm.trim();
      }

      const res = await listSuperAdminAuditLogs(params);
      const rawLogs = res?.data?.logs || (Array.isArray(res?.data) ? res.data : []);
      const pagination = res?.data?.pagination || res?.pagination || {};

      setLogs(rawLogs);
      setTotalCount(pagination.total ?? rawLogs.length);
    } catch (err) {
      console.error('Error fetching SuperAdmin audit logs via REST:', err);
      setLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;

  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.error('No logs to export');
      return;
    }

    const headers = ['Timestamp', 'Action Event', 'User/Initiator', 'Details', 'IP Address', 'Type'];
    const rows = logs.map(log => {
      const timestamp = log.timestamp || log.date;
      const action = log.actionPerformed || log.action || 'Unknown';
      const user = log.userName || log.user || 'System';
      const details = typeof log.modifiedFields === 'string' ? log.modifiedFields : (log.modifiedFields ? JSON.stringify(log.modifiedFields) : (log.details || log.entityType || ''));
      const ip = log.modifiedFields?.ip || log.ip || 'Internal';
      const type = log.entityType || log.type || 'system';

      return [
        timestamp ? new Date(timestamp).toLocaleString() : 'N/A',
        action,
        user,
        details,
        ip,
        type
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  const getTypeColor = (type) => {
    const t = (type || '').toLowerCase();
    switch(t) {
      case 'security': return 'bg-red-100 text-red-700';
      case 'billing': return 'bg-purple-100 text-purple-700';
      case 'system': return 'bg-blue-100 text-blue-700';
      case 'data': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto flex flex-col min-w-0">
      <div className="mb-8 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuClipboardList className="text-primary-600" /> Audit Logs
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track all critical actions, security events, and configuration changes.</p>
        </div>
        <button 
          onClick={handleExportCSV}
          className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 text-sm font-semibold rounded-xl shadow-sm transition-colors flex justify-center items-center gap-2"
        >
          <LuDownload size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden mb-6">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={20} />
            <input 
              type="text"
              placeholder="Search audit action..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="w-full min-w-0 overflow-x-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm border-b border-slate-200 dark:border-slate-700">
                <th className="p-4 font-bold">Timestamp</th>
                <th className="p-4 font-bold">Action Event</th>
                <th className="p-4 font-bold">User / Initiator</th>
                <th className="p-4 font-bold">Details</th>
                <th className="p-4 font-bold">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="font-semibold">Loading audit logs...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    No audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const timestamp = log.timestamp || log.date;
                  const action = log.actionPerformed || log.action || 'Event';
                  const user = log.userName || log.user || 'System';
                  const details = typeof log.modifiedFields === 'string' 
                    ? log.modifiedFields 
                    : (log.modifiedFields ? JSON.stringify(log.modifiedFields) : (log.details || log.entityType || '—'));
                  const ip = log.modifiedFields?.ip || log.ip || 'Internal';
                  const type = log.entityType || log.type || 'system';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="p-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {timestamp ? new Date(timestamp).toLocaleString() : 'N/A'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${getTypeColor(type).split(' ')[0]}`}></span>
                          <span className="font-bold text-slate-900 dark:text-white">{action}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
                            <LuUser size={12} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">
                        {details}
                      </td>
                      <td className="p-4">
                        <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded font-mono text-xs">
                          {ip}
                        </code>
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
              of <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> audit logs
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
