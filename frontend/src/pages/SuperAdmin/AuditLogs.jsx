import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LuClipboardList, 
  LuSearch, 
  LuDownload, 
  LuUser, 
  LuBuilding2, 
  LuFilter, 
  LuX, 
  LuEye, 
  LuCalendar, 
  LuRefreshCw, 
  LuCircleAlert, 
  LuLayers, 
  LuShieldCheck, 
  LuActivity 
} from 'react-icons/lu';
import { listSuperAdminAuditLogs } from '../../api/audit';
import { listTenants } from '../../api/superadmin';
import toast from 'react-hot-toast';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Tenant dropdown options
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Selected log for Details Modal
  const [selectedLog, setSelectedLog] = useState(null);

  // Fetch tenants once on mount for the college selector
  useEffect(() => {
    let isMounted = true;
    const fetchTenantsList = async () => {
      setLoadingTenants(true);
      try {
        const res = await listTenants({ limit: 100 });
        if (!isMounted) return;
        const tenantList = res?.data?.tenants || (Array.isArray(res?.data) ? res.data : []);
        setTenants(tenantList);
      } catch (err) {
        console.error('Failed to load tenants for filter selector:', err);
      } finally {
        if (isMounted) setLoadingTenants(false);
      }
    };
    fetchTenantsList();
    return () => { isMounted = false; };
  }, []);

  // Fetch logs with active filters
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        includeSummary: 'true'
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (selectedSchoolId) {
        params.schoolId = selectedSchoolId;
      }
      if (selectedEntityType) {
        params.entityType = selectedEntityType;
      }
      if (selectedAction) {
        params.action = selectedAction;
      }
      if (actorFilter.trim()) {
        params.actor = actorFilter.trim();
      }
      if (startDate) {
        params.startDate = startDate;
      }
      if (endDate) {
        params.endDate = endDate;
      }

      const res = await listSuperAdminAuditLogs(params);
      const rawLogs = res?.data?.logs || (Array.isArray(res?.data) ? res.data : []);
      const pagination = res?.data?.pagination || res?.pagination || {};
      const summaryData = res?.summary || res?.data?.summary || pagination.summary || null;

      setLogs(rawLogs);
      setTotalCount(pagination.total ?? rawLogs.length);
      if (summaryData) {
        setSummary(summaryData);
      }
    } catch (err) {
      console.error('Error fetching SuperAdmin audit logs:', err);
      setError(err?.message || 'Failed to fetch audit logs. Please try again.');
      setLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage, 
    searchTerm, 
    selectedSchoolId, 
    selectedEntityType, 
    selectedAction, 
    actorFilter, 
    startDate, 
    endDate
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedSchoolId('');
    setSelectedEntityType('');
    setSelectedAction('');
    setActorFilter('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      searchTerm.trim() || 
      selectedSchoolId || 
      selectedEntityType || 
      selectedAction || 
      actorFilter.trim() || 
      startDate || 
      endDate
    );
  }, [searchTerm, selectedSchoolId, selectedEntityType, selectedAction, actorFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;

  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.error('No logs to export');
      return;
    }

    const headers = [
      'Timestamp',
      'College / Tenant',
      'School Code',
      'Module / Entity Type',
      'Entity ID',
      'Action Event',
      'User / Actor',
      'User Role',
      'IP Address',
      'Modified Fields / Details'
    ];

    const rows = logs.map(log => {
      const timestamp = log.timestamp || log.date || log.createdAt;
      const schoolName = log.school?.name || 'Platform';
      const schoolCode = log.school?.code || '—';
      const entityType = log.entityType || '—';
      const entityId = log.entityId || '—';
      const action = log.actionPerformed || log.action || 'Unknown';
      const user = log.userName || log.user || 'System';
      const role = log.userRole || '—';
      const ip = log.modifiedFields?.ip || log.ip || '—';
      const details = typeof log.modifiedFields === 'string' 
        ? log.modifiedFields 
        : (log.modifiedFields ? JSON.stringify(log.modifiedFields) : (log.details || ''));

      return [
        timestamp ? new Date(timestamp).toISOString() : 'N/A',
        schoolName,
        schoolCode,
        entityType,
        entityId,
        action,
        user,
        role,
        ip,
        details
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
      link.setAttribute('download', `superadmin_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const getTypeColor = (type) => {
    const t = (type || '').toLowerCase();
    switch(t) {
      case 'security':
      case 'auth':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'billing':
      case 'subscription':
      case 'fee':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'school':
      case 'tenant':
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
      case 'user':
      case 'staff':
      case 'student':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'role':
      case 'permission':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20';
    }
  };

  const getActionColor = (action) => {
    const a = (action || '').toUpperCase();
    if (a.includes('DELETE') || a.includes('SUSPEND') || a.includes('REJECT')) {
      return 'text-red-600 dark:text-red-400 bg-red-500';
    }
    if (a.includes('CREATE') || a.includes('APPROVE') || a.includes('REACTIVATE')) {
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500';
    }
    if (a.includes('UPDATE') || a.includes('MODIFY') || a.includes('CONFIG')) {
      return 'text-blue-600 dark:text-blue-400 bg-blue-500';
    }
    return 'text-slate-700 dark:text-slate-300 bg-slate-400';
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto flex flex-col min-w-0">
      {/* Header */}
      <div className="mb-6 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuClipboardList className="text-primary-600" /> Audit Logs
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            System-wide activity history, administrative changes, and security events across all tenants.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={fetchLogs}
            disabled={loading}
            title="Refresh logs"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            <LuRefreshCw className={loading ? 'animate-spin' : ''} size={18} />
          </button>
          <button 
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-primary-600 text-white hover:bg-primary-700 text-sm font-semibold rounded-xl shadow-sm transition-colors flex justify-center items-center gap-2"
          >
            <LuDownload size={18} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-xl">
            <LuActivity size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {loading && !totalCount ? '—' : totalCount.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {hasActiveFilters ? 'Filtered Events' : 'Total Audit Events'}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <LuUser size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.distinctActors !== undefined ? summary.distinctActors.toLocaleString() : '—'}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Distinct Actors
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <LuCalendar size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.todayEvents !== undefined ? summary.todayEvents.toLocaleString() : '—'}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Today&apos;s Events
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <LuLayers size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {summary?.topEntityTypes?.[0] 
                ? `${summary.topEntityTypes[0].entityType} (${summary.topEntityTypes[0].count})` 
                : '—'}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Top Active Module
            </div>
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 mb-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-700 dark:text-slate-300">
            <LuFilter size={16} /> Filters & Search
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
            >
              <LuX size={14} /> Clear All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Keyword (action, actor, ID...)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Tenant Selector */}
          <div>
            <select
              value={selectedSchoolId}
              onChange={(e) => {
                setSelectedSchoolId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              <option value="">All Colleges / Tenants</option>
              {loadingTenants ? (
                <option disabled>Loading tenants...</option>
              ) : (
                tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code || 'N/A'})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Module / Entity Type */}
          <div>
            <select
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              <option value="">All Modules</option>
              <option value="School">School / Tenant</option>
              <option value="User">User</option>
              <option value="Staff">Staff</option>
              <option value="Student">Student</option>
              <option value="Parent">Parent</option>
              <option value="Role">Role / RBAC</option>
              <option value="Subscription">Subscription</option>
              <option value="Settings">Settings / Config</option>
              <option value="Attendance">Attendance</option>
              <option value="Security">Security / Auth</option>
            </select>
          </div>

          {/* Action / Event Type */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="LOGIN">Login</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="SUSPEND">Suspend</option>
              <option value="REACTIVATE">Reactivate</option>
              <option value="UPDATE_TENANT_CONFIG">Update Tenant Config</option>
              <option value="PROVISION_TENANT">Provision Tenant</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Actor filter */}
          <div>
            <input 
              type="text"
              placeholder="Filter by actor username..."
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">From:</span>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">To:</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex items-center justify-between text-red-700 dark:text-red-400">
          <div className="flex items-center gap-3">
            <LuCircleAlert size={20} className="shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={fetchLogs}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Logs Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden mb-6">
        <div className="w-full min-w-0 overflow-x-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 font-bold">Timestamp</th>
                <th className="p-4 font-bold">College / Tenant</th>
                <th className="p-4 font-bold">Module</th>
                <th className="p-4 font-bold">Action Event</th>
                <th className="p-4 font-bold">Actor</th>
                <th className="p-4 font-bold">IP Address</th>
                <th className="p-4 font-bold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="font-semibold">Loading audit logs...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <LuShieldCheck size={36} className="mx-auto mb-3 text-slate-400 opacity-60" />
                    <p className="font-bold text-base text-slate-800 dark:text-slate-200">No audit logs found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {hasActiveFilters 
                        ? 'Try clearing some filters or refining your search parameters.' 
                        : 'No activity logs have been recorded in the platform yet.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={handleClearFilters}
                        className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const timestamp = log.timestamp || log.date || log.createdAt;
                  const action = log.actionPerformed || log.action || 'Event';
                  const user = log.userName || log.user || 'System';
                  const role = log.userRole || 'SYSTEM';
                  const ip = log.modifiedFields?.ip || log.ip || '—';
                  const entityType = log.entityType || 'General';
                  const schoolName = log.school?.name || (log.schoolId ? 'Assigned Tenant' : 'Platform');
                  const schoolCode = log.school?.code;

                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {timestamp ? new Date(timestamp).toLocaleString() : 'N/A'}
                      </td>

                      {/* College / Tenant */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <LuBuilding2 size={16} className="text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[180px]">
                              {schoolName}
                            </span>
                            {schoolCode && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                {schoolCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Module / Entity Type */}
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(entityType)}`}>
                          {entityType}
                        </span>
                      </td>

                      {/* Action Event */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${getActionColor(action)}`}></span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {action}
                          </span>
                        </div>
                      </td>

                      {/* Actor & Role */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                            <LuUser size={13} />
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                              {user}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">
                              {role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="p-4 whitespace-nowrap">
                        <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-mono text-xs">
                          {ip}
                        </code>
                      </td>

                      {/* Details Action */}
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
                        >
                          <LuEye size={14} /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
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
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                let pageNum = idx + 1;
                if (totalPages > 5) {
                  const startOffset = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                  pageNum = startOffset + idx;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
                      currentPage === pageNum
                        ? 'bg-primary-600 text-white shadow-xs'
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
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <LuClipboardList className="text-primary-600" /> Audit Record Details
                </h3>
                <span className="text-xs font-mono text-slate-400 truncate block mt-0.5">
                  ID: {selectedLog.id}
                </span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Core attributes grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Timestamp</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block">
                    {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : 'Unavailable'}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Action Performed</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${getActionColor(selectedLog.actionPerformed)}`}></span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedLog.actionPerformed || 'Unknown'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Actor & Role</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block">
                    {selectedLog.userName || 'System'} ({selectedLog.userRole || 'SYSTEM'})
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">College / Tenant</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block truncate">
                    {selectedLog.school?.name 
                      ? `${selectedLog.school.name} (${selectedLog.school.code || 'N/A'})` 
                      : (selectedLog.schoolId || 'Platform-wide')}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Module & Entity ID</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block font-mono text-xs truncate">
                    {selectedLog.entityType || 'N/A'} : {selectedLog.entityId || 'N/A'}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">IP & Network Metadata</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block font-mono text-xs">
                    IP: {selectedLog.modifiedFields?.ip || 'Unavailable'}
                  </span>
                </div>
              </div>

              {/* Modified Fields Comparison or Structured Payload */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 text-sm flex items-center justify-between">
                  <span>Modified Fields & Audit Data</span>
                  <span className="text-xs font-normal text-slate-400">(Sanitized)</span>
                </h4>

                {(() => {
                  const mf = selectedLog.modifiedFields;
                  if (!mf || (typeof mf === 'object' && Object.keys(mf).length === 0)) {
                    return (
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs italic">
                        No modified field details captured for this record.
                      </div>
                    );
                  }

                  // Check if before / after structure is available
                  const hasBeforeAfter = mf && typeof mf === 'object' && (mf.before || mf.after);
                  if (hasBeforeAfter) {
                    const before = mf.before || {};
                    const after = mf.after || {};
                    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

                    return (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-3">Field</th>
                              <th className="p-3">Before</th>
                              <th className="p-3">After</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                            {allKeys.map((key) => (
                              <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{key}</td>
                                <td className="p-3 text-red-600 dark:text-red-400">
                                  {before[key] !== undefined ? JSON.stringify(before[key]) : <span className="italic text-slate-400">none</span>}
                                </td>
                                <td className="p-3 text-emerald-600 dark:text-emerald-400">
                                  {after[key] !== undefined ? JSON.stringify(after[key]) : <span className="italic text-slate-400">none</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // Default structured JSON view
                  return (
                    <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-60 custom-scrollbar border border-slate-800">
                      <pre>{JSON.stringify(mf, null, 2)}</pre>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
