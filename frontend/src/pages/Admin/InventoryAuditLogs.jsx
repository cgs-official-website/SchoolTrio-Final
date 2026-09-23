import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Search, Calendar, Download, RefreshCw, Loader2
} from 'lucide-react';
import { LuClipboardList } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import { listAuditLogs, fetchAllPages } from '../../api/inventory';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function InventoryAuditLogs() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [userFilter, setUserFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');
  const [transactionFilter, setTransactionFilter] = useState('All'); // 'All' | 'inbound' | 'outbound'
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown options lists (derived from loaded data or known sets)
  const [productsList, setProductsList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [actionsList, setActionsList] = useState([]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, productFilter, categoryFilter, userFilter, actionFilter, transactionFilter, searchTerm]);

  // Load audit logs via REST
  const loadLogs = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    const query = {
      page,
      limit,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      productName: productFilter !== 'All' ? productFilter : undefined,
      category: categoryFilter !== 'All' ? categoryFilter : undefined,
      userName: userFilter !== 'All' ? userFilter : undefined,
      actionType: actionFilter !== 'All' ? actionFilter : undefined,
      transactionType: transactionFilter !== 'All' ? transactionFilter : undefined,
      search: searchTerm.trim() || undefined
    };

    try {
      const res = await listAuditLogs(query);
      const data = Array.isArray(res?.data) ? res.data : [];
      const meta = res?.meta || {};

      setLogs(data);
      setTotal(meta.total || data.length);
      setTotalPages(meta.totalPages || 1);

      setProductsList(prev => {
        const next = new Set(prev);
        data.forEach(l => { if (l.itemName) next.add(l.itemName); });
        return Array.from(next);
      });
      setCategoriesList(prev => {
        const next = new Set(prev);
        data.forEach(l => { if (l.category) next.add(l.category); });
        return Array.from(next);
      });
      setUsersList(prev => {
        const next = new Set(prev);
        data.forEach(l => { if (l.userName) next.add(l.userName); });
        return Array.from(next);
      });
      setActionsList(prev => {
        const next = new Set(prev);
        data.forEach(l => { if (l.type) next.add(l.type); });
        return Array.from(next);
      });
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      toast.error(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [schoolId, page, limit, startDate, endDate, productFilter, categoryFilter, userFilter, actionFilter, transactionFilter, searchTerm]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Fetch full filtered logs dataset for export to prevent silent truncation
  const getFullExportDataset = async () => {
    const query = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      productName: productFilter !== 'All' ? productFilter : undefined,
      category: categoryFilter !== 'All' ? categoryFilter : undefined,
      userName: userFilter !== 'All' ? userFilter : undefined,
      actionType: actionFilter !== 'All' ? actionFilter : undefined,
      transactionType: transactionFilter !== 'All' ? transactionFilter : undefined,
      search: searchTerm.trim() || undefined
    };

    return fetchAllPages(listAuditLogs, query, 100);
  };

  // Export audit logs
  const handleExport = async (format) => {
    setExportLoading(true);
    try {
      const fullLogs = await getFullExportDataset();
      if (!fullLogs || fullLogs.length === 0) {
        toast.error('No log entries match your filter settings to export.');
        return;
      }

      const rows = fullLogs.map((l, idx) => ({
        'Log ID': l.id || `LOG-${idx + 1000}`,
        'Date & Time': new Date(l.timestamp).toLocaleString(),
        'User Name': l.userName,
        'User Role': l.userRole || 'Staff',
        'Action Type': l.type || l.actionType || '—',
        'Product Name': l.itemName || l.productName || '—',
        'Product ID': l.productId || '—',
        'Category': l.category || '—',
        'Previous Stock': l.prevStock !== undefined && l.prevStock !== null ? l.prevStock : (l.previousStock !== undefined ? l.previousStock : '—'),
        'New Stock': l.newStock !== undefined && l.newStock !== null ? l.newStock : '—',
        'Quantity Changed': l.quantity !== undefined ? l.quantity : (l.quantityChanged !== undefined ? l.quantityChanged : '—'),
        'Remarks': l.remarks || '—'
      }));

      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === 'csv') {
        const headers = ['Log ID', 'Date & Time', 'User Name', 'User Role', 'Action Type', 'Product Name', 'Product ID', 'Category', 'Previous Stock', 'New Stock', 'Quantity Changed', 'Remarks'];
        const csvContent = [
          headers.join(','),
          ...rows.map(r => [
            `"${r['Log ID']}"`,
            `"${r['Date & Time']}"`,
            `"${r['User Name'].replace(/"/g, '""')}"`,
            `"${r['User Role'].replace(/"/g, '""')}"`,
            `"${r['Action Type'].replace(/"/g, '""')}"`,
            `"${r['Product Name'].replace(/"/g, '""')}"`,
            `"${r['Product ID'].replace(/"/g, '""')}"`,
            `"${r['Category'].replace(/"/g, '""')}"`,
            r['Previous Stock'],
            r['New Stock'],
            r['Quantity Changed'],
            `"${r['Remarks'].replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `inventory_audit_logs_${dateStr}.csv`);
        link.click();
        toast.success(`Exported ${rows.length} audit logs to CSV`);
      } else if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
        XLSX.writeFile(wb, `inventory_audit_logs_${dateStr}.xlsx`);
        toast.success(`Exported ${rows.length} audit logs to Excel`);
      } else if (format === 'pdf') {
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape A4
        doc.setFontSize(18);
        doc.text('Inventory Audit Logs Report', 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${rows.length}`, 14, 20);

        const tableHeaders = [['Date & Time', 'User', 'Role', 'Action', 'Product', 'Prev', 'New', 'Diff', 'Remarks']];
        const tableRows = fullLogs.map(l => [
          new Date(l.timestamp).toLocaleString(),
          l.userName || '—',
          l.userRole || 'Staff',
          l.type || l.actionType || '—',
          l.itemName || l.productName || '—',
          l.prevStock !== undefined && l.prevStock !== null ? l.prevStock : '—',
          l.newStock !== undefined && l.newStock !== null ? l.newStock : '—',
          l.quantity !== undefined ? l.quantity : (l.quantityChanged !== undefined ? l.quantityChanged : '—'),
          l.remarks || '—'
        ]);

        autoTable(doc, {
          head: tableHeaders,
          body: tableRows,
          startY: 25,
          theme: 'striped',
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 20 },
            3: { cellWidth: 25 },
            4: { cellWidth: 35 },
            5: { cellWidth: 12 },
            6: { cellWidth: 12 },
            7: { cellWidth: 12 },
            8: { cellWidth: 60 }
          }
        });

        doc.save(`inventory_audit_logs_${dateStr}.pdf`);
        toast.success(`Exported ${rows.length} audit logs to PDF`);
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export audit logs');
    } finally {
      setExportLoading(false);
    }
  };

  const clearAllFilters = () => {
    setStartDate('');
    setEndDate('');
    setProductFilter('All');
    setCategoryFilter('All');
    setUserFilter('All');
    setActionFilter('All');
    setTransactionFilter('All');
    setSearchTerm('');
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto flex flex-col min-h-screen pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/admin/inventory')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <ArrowLeft size={18} className="text-slate-800 dark:text-slate-100" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <LuClipboardList className="text-primary-600" /> Inventory Audit Logs
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Review, filter, and track all stock inbound/outbound records.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={clearAllFilters}
            className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-semibold"
          >
            <RefreshCw size={16} /> Reset
          </button>

          <div className="relative group">
            <button 
              disabled={exportLoading}
              className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition-all font-semibold shadow-sm disabled:opacity-50"
            >
              {exportLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Export Logs
            </button>
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl hidden group-hover:block hover:block z-50">
              <button onClick={() => handleExport('xlsx')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 rounded-t-2xl">Excel (.xlsx)</button>
              <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200">CSV (.csv)</button>
              <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 rounded-b-2xl">PDF Document</button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 shadow-sm mb-6 shrink-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Search Logs</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={16} />
            <input 
              type="text"
              placeholder="Search product, user name, remarks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-black font-medium"
            />
          </div>
        </div>

        {/* Date Start */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={16} />
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-black font-semibold"
            />
          </div>
        </div>

        {/* Date End */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">End Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={16} />
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-black font-semibold"
            />
          </div>
        </div>

        {/* Product Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Product</label>
          <select 
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="All">All Products</option>
            {productsList.map((p, i) => <option key={i} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Category</label>
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="All">All Categories</option>
            {categoriesList.map((c, i) => <option key={i} value={c}>{c}</option>)}
          </select>
        </div>

        {/* User Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">User</label>
          <select 
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="All">All Users</option>
            {usersList.map((u, i) => <option key={i} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Action Type Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Action Type</label>
          <select 
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="All">All Actions</option>
            {actionsList.map((a, i) => <option key={i} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Transaction Type Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Transaction Type</label>
          <select 
            value={transactionFilter}
            onChange={(e) => setTransactionFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="All">All Transactions</option>
            <option value="inbound">Inbound Stock</option>
            <option value="outbound">Outbound Stock</option>
          </select>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden mb-6">
        {loading ? (
          <div className="flex items-center justify-center p-24">
            <Loader2 className="animate-spin text-primary-600" size={36} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
                    <th className="p-4 pl-6">Timestamp</th>
                    <th className="p-4">User</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Stock Changed</th>
                    <th className="p-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {logs.map((log) => {
                    const actionName = log.type || log.actionType || '—';
                    const actLower = actionName.toLowerCase();
                    const qtyVal = log.quantity !== undefined ? log.quantity : log.quantityChanged;

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-6 font-semibold text-slate-500 dark:text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4 font-bold text-slate-900 dark:text-white">{log.userName || '—'}</td>
                        <td className="p-4 capitalize text-slate-600 dark:text-slate-300 font-semibold">{log.userRole || 'Staff'}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            actLower.includes('create') ? 'bg-green-100 text-green-700' :
                            actLower.includes('delete') ? 'bg-red-100 text-red-700' :
                            actLower.includes('inbound') ? 'bg-emerald-100 text-emerald-700' :
                            actLower.includes('outbound') ? 'bg-orange-100 text-orange-700' :
                            'bg-indigo-100 text-indigo-700'
                          }`}>
                            {actionName}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-900 dark:text-white">{log.itemName || log.productName || '—'}</td>
                        <td className="p-4">
                          {qtyVal !== undefined && qtyVal !== null ? (
                            <div className="flex flex-col text-xs">
                              <span className={`font-bold ${qtyVal > 0 ? 'text-emerald-600' : qtyVal < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                {qtyVal > 0 ? `+${qtyVal}` : qtyVal}
                              </span>
                              {(log.prevStock !== undefined && log.newStock !== undefined) && (
                                <span className="text-slate-400 dark:text-slate-300">
                                  {log.prevStock} → {log.newStock}
                                </span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300 font-medium max-w-xs truncate" title={log.remarks}>
                          {log.remarks || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-12 text-center text-slate-500 dark:text-slate-400 font-medium">
                        No audit log entries found matching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Server-side pagination controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-3xl shrink-0">
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Showing <span className="font-semibold text-slate-900 dark:text-white">{(page - 1) * limit + 1}</span> to{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {Math.min(page * limit, total)}
                  </span>{' '}
                  of <span className="font-semibold text-slate-900 dark:text-white">{total}</span> records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
