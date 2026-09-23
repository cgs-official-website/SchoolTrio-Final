import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Search, Edit, Trash2, Download, Settings, Printer, FileText } from 'lucide-react';
import { LuBriefcase, LuIndianRupee, LuCircleDollarSign, LuFileDown as FileDown } from 'react-icons/lu';
import ConfirmModal from '../../components/ConfirmModal';
import ExportModal from '../../components/ExportModal';
import { useAuth } from '../../context/AuthContext';
import {
  listPayroll,
  generatePayroll,
  updatePayrollStatus,
  deletePayroll,
  getConfig,
  updateConfig,
  fetchAllPayroll
} from '../../api/hr-payroll';
import { listStaff } from '../../api/staff';
import { uploadFileToCloudinaryOrFirebase } from '../../utils/cloudinary';
import CustomFieldsRenderer from '../../components/CustomFieldsRenderer';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import usePermissions from '../../hooks/usePermissions';

export default function HRPayrollManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('hr-payroll');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('hr-payroll');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('hr-payroll');

  const [payrolls, setPayrolls] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hrConfig, setHrConfig] = useState({ authorizedSignature: null });

  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPayslipModal, setShowPayslipModal] = useState(null); // stores payroll object
  const [confirmModalState, setConfirmModalState] = useState({ isOpen: false, idToDelete: null });
  const [formData, setFormData] = useState({ teacherId: '', name: '', role: '', baseSalary: 0, deductions: 0, status: 'Pending', pfCalculated: 0, esiCalculated: 0, customData: {} });
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [selectedFields, setSelectedFields] = useState({
    name: true,
    role: true,
    month: true,
    baseSalary: true,
    pfCalculated: true,
    esiCalculated: true,
    deductions: true,
    netPay: true,
    status: true,
    staffId: true,
    bankAccountNumber: true,
    bankName: true,
    ifscCode: true,
    panNumber: true,
    aadharNumber: true
  });

  const availableFieldsList = [
    { key: 'name', label: 'Staff Name' },
    { key: 'role', label: 'Role / Designation' },
    { key: 'month', label: 'Payroll Month' },
    { key: 'baseSalary', label: 'Base Salary (₹)' },
    { key: 'pfCalculated', label: 'PF Deduction (₹)' },
    { key: 'esiCalculated', label: 'ESI Deduction (₹)' },
    { key: 'deductions', label: 'Total Deductions (₹)' },
    { key: 'netPay', label: 'Net Pay (₹)' },
    { key: 'status', label: 'Payment Status' },
    { key: 'staffId', label: 'Staff ID' },
    { key: 'bankAccountNumber', label: 'Bank Account No.' },
    { key: 'bankName', label: 'Bank Name & Branch' },
    { key: 'ifscCode', label: 'IFSC Code' },
    { key: 'panNumber', label: 'PAN Number' },
    { key: 'aadharNumber', label: 'Aadhaar Number' },
    { key: 'createdAt', label: 'Record Created Date' }
  ];

  const handleFieldToggle = (fieldKey) => {
    setSelectedFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const handleSelectAll = (selectVal) => {
    const updated = {};
    availableFieldsList.forEach(field => {
      updated[field.key] = selectVal;
    });
    setSelectedFields(updated);
  };

  const handleExport = async (customFileName) => {
    try {
      toast.loading("Preparing payroll export...", { id: 'export-payroll' });
      const exportList = await fetchAllPayroll({});
      toast.dismiss('export-payroll');

      if (!exportList || exportList.length === 0) {
        toast.error("No payroll data available to export.");
        return;
      }

      const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
      if (activeFields.length === 0) {
        toast.error("Please select at least one column to export.");
        return;
      }

      const exportData = exportList.map((payroll, index) => {
        const staff = payroll.staffProfile || teachers.find(t => t.id === payroll.teacherId) || {};
        const baseSalary = Number(payroll.baseSalary || 0);
        const deductions = Number(payroll.deductions || 0);
        const netPay = Number(payroll.netPay !== undefined ? payroll.netPay : baseSalary - deductions);
        const row = { "S.No": index + 1 };
        
        if (selectedFields.name) row["Staff Name"] = staff.name || payroll.name || '';
        if (selectedFields.role) row["Role / Designation"] = staff.designation || staff.role || payroll.role || '';
        if (selectedFields.month) row["Payroll Month"] = payroll.month || '';
        if (selectedFields.baseSalary) row["Base Salary (₹)"] = baseSalary;
        if (selectedFields.pfCalculated) row["PF Deduction (₹)"] = Number(payroll.pfCalculated || 0);
        if (selectedFields.esiCalculated) row["ESI Deduction (₹)"] = Number(payroll.esiCalculated || 0);
        if (selectedFields.deductions) row["Total Deductions (₹)"] = deductions;
        if (selectedFields.netPay) row["Net Pay (₹)"] = netPay;
        if (selectedFields.status) row["Payment Status"] = payroll.status || 'Pending';
        if (selectedFields.staffId) row["Staff ID"] = staff.employeeId || staff.staffId || '';
        if (selectedFields.bankAccountNumber) row["Bank Account No."] = staff.bankAccountNumber || staff.accountNumber || '';
        if (selectedFields.bankName) row["Bank Name & Branch"] = staff.bankName ? `${staff.bankName} ${staff.branchName || ''}`.trim() : '';
        if (selectedFields.ifscCode) row["IFSC Code"] = staff.ifscCode || '';
        if (selectedFields.panNumber) row["PAN Number"] = staff.panNumber || '';
        if (selectedFields.aadharNumber) row["Aadhaar Number"] = staff.aadharNumber || '';
        if (selectedFields.createdAt) row["Record Created Date"] = payroll.createdAt ? new Date(payroll.createdAt).toLocaleDateString('en-GB') : '';
        
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll Report");
      
      const rawName = (customFileName || exportFileName || "HR_Payroll_Report").trim();
      const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;
      
      XLSX.writeFile(workbook, finalFileName);
      setShowExportModal(false);
      toast.success("Payroll report exported successfully!");
    } catch (err) {
      toast.dismiss('export-payroll');
      console.error("Export failed", err);
      toast.error("Failed to export payroll report");
    }
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const [signatureFile, setSignatureFile] = useState(null);
  const [uploadingSig, setUploadingSig] = useState(false);

  // Fetch HR Configuration (Authorized Signature)
  const fetchHRConfig = useCallback(async () => {
    try {
      const res = await getConfig();
      if (res?.data) {
        setHrConfig(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch HR config", err);
    }
  }, []);

  // Fetch Staff List for Dropdowns
  const fetchStaffList = useCallback(async () => {
    try {
      const res = await listStaff({ limit: 100 });
      if (res?.data) {
        setTeachers(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch staff list", err);
    }
  }, []);

  // Fetch Payroll Records
  const fetchPayrollList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listPayroll({ limit: 100 });
      if (res?.data) {
        setPayrolls(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch payroll list", err);
      toast.error(err.message || "Failed to load payroll records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHRConfig();
    fetchStaffList();
    fetchPayrollList();
  }, [fetchHRConfig, fetchStaffList, fetchPayrollList]);

  const calculateDeductions = (salary) => {
    const pfCeiling = 15000;
    const pfApplicable = Math.min(salary, pfCeiling);
    const pf = Math.round(pfApplicable * 0.12);

    const esiCeiling = 21000;
    const esi = salary <= esiCeiling ? Math.round(salary * 0.0075) : 0;

    return { pf, esi, total: pf + esi };
  };

  const handleTeacherSelect = (teacherId) => {
    const selected = teachers.find(t => t.id === teacherId);
    if (selected) {
      const name = selected.name || `${selected.firstName || ''} ${selected.lastName || ''}`.trim();
      const role = selected.designation || selected.staffType || 'Staff'; 
      
      const previousPayroll = payrolls.filter(p => p.teacherId === teacherId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      const defaultSalary = previousPayroll ? Number(previousPayroll.baseSalary) : Number(selected.baseSalary || 0);
      const { pf, esi, total } = calculateDeductions(defaultSalary);

      setFormData(prev => ({ 
        ...prev, 
        teacherId, 
        name, 
        role,
        baseSalary: defaultSalary,
        deductions: total,
        pfCalculated: pf,
        esiCalculated: esi
      }));
    } else {
      setFormData(prev => ({ ...prev, teacherId: '', name: '', role: '', baseSalary: 0, deductions: 0, pfCalculated: 0, esiCalculated: 0, customData: {} }));
    }
  };

  const handleSalaryChange = (val) => {
    const salary = parseFloat(val) || 0;
    const { pf, esi, total } = calculateDeductions(salary);
    setFormData(prev => ({ 
      ...prev, 
      baseSalary: salary, 
      deductions: total,
      pfCalculated: pf,
      esiCalculated: esi
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (formData.id && !hasEditPermission) {
      toast.error("You do not have permission to edit payroll records.");
      return;
    }
    if (!formData.id && !hasCreatePermission) {
      toast.error("You do not have permission to create payroll records.");
      return;
    }
    if (!formData.teacherId) {
      toast.error("Please select a staff member");
      return;
    }

    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!formData.id) {
      const isDuplicate = payrolls.some(p => p.teacherId === formData.teacherId && p.month?.toLowerCase() === currentMonth.toLowerCase());
      if (isDuplicate) {
        toast.error(`Payroll for this staff member already exists for ${currentMonth}.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (formData.id) {
        // Status and record update via REST
        await updatePayrollStatus(formData.id, {
          status: formData.status
        });
        toast.success("Payroll updated successfully");
      } else {
        // Generate new record via REST
        await generatePayroll({
          month: currentMonth,
          records: [
            {
              staffId: formData.teacherId,
              baseSalary: Number(formData.baseSalary || 0),
              deductions: Number(formData.deductions || 0),
              pfCalculated: Number(formData.pfCalculated || 0),
              esiCalculated: Number(formData.esiCalculated || 0),
              netPay: Number(formData.baseSalary || 0) - Number(formData.deductions || 0),
              customData: formData.customData || {}
            }
          ]
        });
        toast.success("Payroll record added");
      }
      setShowModal(false);
      setFormData({ teacherId: '', name: '', role: '', baseSalary: 0, deductions: 0, status: 'Pending', pfCalculated: 0, esiCalculated: 0, customData: {} });
      await fetchPayrollList();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to save payroll record");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (id) => {
    if (!hasDeletePermission) return;
    setConfirmModalState({ isOpen: true, idToDelete: id });
  };

  const executeDelete = async () => {
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete payroll records.");
      return;
    }
    const id = confirmModalState.idToDelete;
    if (!id) return;
    try {
      await deletePayroll(id);
      toast.success("Record deleted");
      await fetchPayrollList();
    } catch (err) {
      toast.error(err.message || "Failed to delete record");
    }
    setConfirmModalState({ isOpen: false, idToDelete: null });
  };

  const handleUploadSignature = async () => {
    if (!signatureFile) return;
    setUploadingSig(true);
    try {
      const downloadURL = await uploadFileToCloudinaryOrFirebase(
        signatureFile, 
        schoolId, 
        `schools/${schoolId}/hr/signature_${Date.now()}`
      );
      
      const res = await updateConfig({ authorizedSignature: downloadURL });
      setHrConfig(res?.data || { authorizedSignature: downloadURL });
      
      toast.success("Signature uploaded successfully!");
      setSignatureFile(null);
      setUploadingSig(false);
    } catch (err) {
      console.error("Signature upload failed", err);
      toast.error(err.message || "Failed to upload signature.");
      setUploadingSig(false);
    }
  };

  const handleRemoveSignature = async () => {
    try {
      await updateConfig({ authorizedSignature: null });
      setHrConfig({ authorizedSignature: null });
      toast.success("Signature removed successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to remove signature.");
    }
  };

  const filteredPayrolls = payrolls.filter(p => {
    const staffName = p.staffProfile?.name || p.name || '';
    const staffRole = p.staffProfile?.designation || p.role || '';
    const staffId = p.staffProfile?.employeeId || '';
    const q = searchTerm.toLowerCase();
    return staffName.toLowerCase().includes(q) || staffRole.toLowerCase().includes(q) || staffId.toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filteredPayrolls.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPayrolls = filteredPayrolls.slice(indexOfFirstItem, indexOfLastItem);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    if (!showPayslipModal) return;
    const payroll = showPayslipModal;
    const staff = payroll.staffProfile || teachers.find(t => t.id === payroll.teacherId) || {};
    const docPDF = new jsPDF();
    const baseSalary = Number(payroll.baseSalary || 0);
    const deductions = Number(payroll.deductions || 0);
    const netPay = Number(payroll.netPay !== undefined ? payroll.netPay : baseSalary - deductions);
    const staffName = staff.name || payroll.name || 'Staff Member';
    const staffRole = staff.designation || payroll.role || 'Staff';

    docPDF.setFontSize(22);
    docPDF.setTextColor(30, 58, 138); 
    docPDF.text("Payslip", 105, 20, { align: 'center' });
    
    docPDF.setFontSize(12);
    docPDF.setTextColor(100, 116, 139); 
    docPDF.text(`Month: ${payroll.month || 'N/A'}`, 105, 30, { align: 'center' });

    docPDF.setFontSize(11);
    docPDF.setTextColor(15, 23, 42); 
    docPDF.text(`Employee Name: ${staffName}`, 20, 50);
    docPDF.text(`Role/Position: ${staffRole}`, 20, 60);
    docPDF.text(`Status: ${payroll.status}`, 20, 70);

    autoTable(docPDF, {
      startY: 85,
      head: [['Description', 'Amount (INR)']],
      body: [
        ['Base Salary', `Rs. ${baseSalary.toLocaleString()}`],
        ['PF Deduction', `- Rs. ${Number(payroll.pfCalculated || 0).toLocaleString()}`],
        ['ESI Deduction', `- Rs. ${Number(payroll.esiCalculated || 0).toLocaleString()}`],
        ['Other Deductions', `- Rs. ${Math.max(0, deductions - Number(payroll.pfCalculated || 0) - Number(payroll.esiCalculated || 0)).toLocaleString()}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 6 },
    });

    const finalY = docPDF.lastAutoTable.finalY || 130;
    docPDF.setFontSize(14);
    docPDF.setTextColor(16, 185, 129); 
    docPDF.text(`Net Payable: Rs. ${netPay.toLocaleString()}`, 190, finalY + 15, { align: 'right' });

    if (hrConfig?.authorizedSignature) {
      try {
        docPDF.addImage(hrConfig.authorizedSignature, 'PNG', 140, finalY + 25, 40, 15);
        docPDF.setFontSize(10);
        docPDF.setTextColor(100, 116, 139);
        docPDF.text("Authorized Signatory", 160, finalY + 45, { align: 'center' });
      } catch (e) {
        console.error("Could not add signature to PDF", e);
      }
    }

    docPDF.save(`Payslip_${payroll.month || 'Current'}_${staffName}.pdf`);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col min-w-0 print:p-0 print:h-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4 shrink-0 print:hidden w-full">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">HR & Payroll</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage staff salaries, deductions, and payslips.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
          {hasEditPermission && (
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-medium shadow-sm cursor-pointer"
            >
              <Settings size={20} /> Settings
            </button>
          )}
          <button 
            onClick={() => {
              if (payrolls.length === 0) {
                toast.error("No payroll data available to export.");
                return;
              }
              setExportFileName('HR_Payroll_Report'); 
              setShowExportModal(true); 
            }}
            className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-4 py-2.5 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all font-semibold shadow-sm cursor-pointer text-sm"
          >
            <FileDown size={18} /> Bulk Export
          </button>
          {hasCreatePermission && (
            <button 
              onClick={() => { setFormData({ teacherId: '', name: '', role: '', baseSalary: 0, deductions: 0, status: 'Pending', pfCalculated: 0, esiCalculated: 0, customData: {} }); setShowModal(true); }}
              className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-all font-medium shadow-sm cursor-pointer"
            >
              <Plus size={20} /> Add Record
            </button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0 print:hidden">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <LuCircleDollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Disbursed</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              ₹{payrolls.filter(p => p.status === 'Paid' || p.status === 'Payslip Released').reduce((acc, curr) => acc + (Number(curr.netPay) || (Number(curr.baseSalary || 0) - Number(curr.deductions || 0))), 0).toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
            <LuIndianRupee size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pending Approvals</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              ₹{payrolls.filter(p => p.status === 'Pending').reduce((acc, curr) => acc + (Number(curr.netPay) || (Number(curr.baseSalary || 0) - Number(curr.deductions || 0))), 0).toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <LuBriefcase size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Staff on Payroll</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {new Set(payrolls.map(p => p.teacherId)).size}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0 print:border-none print:shadow-none">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0 print:hidden">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search staff, designation..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0 custom-scrollbar print:overflow-visible">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 sticky top-0 backdrop-blur-sm z-10">
              <tr>
                <th className="p-4">Employee</th>
                <th className="p-4">Designation</th>
                <th className="p-4">Month</th>
                <th className="p-4">Base Salary</th>
                <th className="p-4">Deductions</th>
                <th className="p-4">Net Pay</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500">
                    Loading payroll records...
                  </td>
                </tr>
              ) : currentPayrolls.map(payroll => {
                const staff = payroll.staffProfile || teachers.find(t => t.id === payroll.teacherId) || {};
                const baseSalary = Number(payroll.baseSalary || 0);
                const deductions = Number(payroll.deductions || 0);
                const netPay = Number(payroll.netPay !== undefined ? payroll.netPay : baseSalary - deductions);
                const displayName = staff.name || payroll.name || 'Staff Member';
                const displayRole = staff.designation || payroll.role || 'Staff';

                return (
                  <tr key={payroll.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-900 dark:text-white truncate" title={displayName}>{displayName}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-300 font-medium truncate" title={displayRole}>{displayRole}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-300 font-medium truncate" title={payroll.month}>{payroll.month}</td>
                    <td className="p-4 text-slate-700 dark:text-slate-200 truncate">₹{baseSalary.toLocaleString()}</td>
                    <td className="p-4 text-red-600 truncate">-₹{deductions.toLocaleString()}</td>
                    <td className="p-4 font-bold text-emerald-600 truncate">₹{netPay.toLocaleString()}</td>
                    <td className="p-4 truncate">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        payroll.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                        payroll.status === 'Payslip Released' ? 'bg-purple-100 text-purple-700' : 
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {payroll.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {payroll.status === 'Payslip Released' && (
                          <button 
                            onClick={() => setShowPayslipModal(payroll)}
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Download Payslip"
                          >
                            <FileText size={16} />
                          </button>
                        )}
                        {hasEditPermission && (
                          <button 
                            onClick={() => { 
                              setFormData({
                                id: payroll.id,
                                teacherId: payroll.teacherId,
                                name: displayName,
                                role: displayRole,
                                baseSalary,
                                deductions,
                                status: payroll.status || 'Pending',
                                pfCalculated: Number(payroll.pfCalculated || 0),
                                esiCalculated: Number(payroll.esiCalculated || 0),
                                customData: payroll.customData || {}
                              }); 
                              setShowModal(true); 
                            }} 
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" 
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {hasDeletePermission && (
                          <button 
                            onClick={() => handleDeleteClick(payroll.id)} 
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" 
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredPayrolls.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    No payroll records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 flex flex-col sm:flex-row gap-4 items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredPayrolls.length)} of {filteredPayrolls.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  const isCurrent = page === currentPage;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`h-9 w-9 flex items-center justify-center rounded-xl text-sm font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-primary-600 text-white shadow-md shadow-primary-600/10'
                          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Payroll Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {formData.id ? 'Edit Payroll Record' : 'Generate Payroll'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full p-2 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Staff Member</label>
                  <select 
                    required 
                    value={formData.teacherId} 
                    onChange={e => handleTeacherSelect(e.target.value)}
                    disabled={!!formData.id}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 disabled:opacity-60"
                  >
                    <option value="">-- Choose Employee --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()} ({t.designation || t.staffType || 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Base Salary (₹)</label>
                    <input 
                      type="number" required min="0"
                      value={formData.baseSalary} onChange={e => handleSalaryChange(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Total Deductions (₹)</label>
                    <input 
                      type="number" required min="0"
                      value={formData.deductions} onChange={e => setFormData({...formData, deductions: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Includes 12% PF (₹{formData.pfCalculated || 0}) and 0.75% ESI (₹{formData.esiCalculated || 0}). Edit if needed.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Status</label>
                  <select 
                    value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  >
                    <option>Paid</option>
                    <option>Pending</option>
                    <option>Payslip Released</option>
                  </select>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 mt-6">
                  <CustomFieldsRenderer
                    moduleKey="hr-payroll"
                    customData={formData.customData}
                    onChange={(k, v) => setFormData(prev => ({...prev, customData: {...(prev.customData || {}), [k]: v}}))}
                  />
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-6 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Payroll Summary</h4>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-600 dark:text-slate-300 font-medium text-sm">Base Salary</span>
                    <span className="text-slate-900 dark:text-white font-bold">₹{(formData.baseSalary || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-red-600 font-medium text-sm">Total Deductions</span>
                    <span className="text-red-600 font-bold">-₹{(formData.deductions || 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="text-emerald-700 font-bold text-sm">Net Balance (Payable)</span>
                    <span className="text-emerald-700 font-black text-xl">₹{Math.max(0, (formData.baseSalary || 0) - (formData.deductions || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl shadow-sm transition-colors disabled:opacity-60 cursor-pointer">
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HR Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">HR Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full p-2 transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Authorized Signature</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">This signature will appear on all generated payslips.</p>
              
              {hrConfig?.authorizedSignature && (
                <div className="mb-4 p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Current Signature</p>
                    <img src={hrConfig.authorizedSignature} alt="Authorized Signature" className="max-h-16 object-contain mix-blend-multiply" />
                  </div>
                  <button 
                    onClick={handleRemoveSignature}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Remove Signature"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setSignatureFile(e.target.files[0])}
                  className="flex-1 text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer border border-slate-200 dark:border-slate-700 rounded-xl p-1.5"
                />
                <button 
                  onClick={handleUploadSignature}
                  disabled={!signatureFile || uploadingSig}
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer"
                >
                  {uploadingSig ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onClick={() => setShowSettingsModal(false)} className="px-5 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title="Delete Payroll Record"
        message="Are you sure you want to delete this payroll record? This action cannot be undone."
        onConfirm={executeDelete}
        onCancel={() => setConfirmModalState({ isOpen: false, idToDelete: null })}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        title="Export HR & Payroll Records"
        availableFields={availableFieldsList}
        selectedFields={selectedFields}
        onToggleField={handleFieldToggle}
        onSelectAll={handleSelectAll}
        fileName={exportFileName}
        onFileNameChange={setExportFileName}
        onConfirm={handleExport}
        onCancel={() => setShowExportModal(false)}
      />

      {/* Payslip Modal (Printable) */}
      {showPayslipModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-8 print:p-0 print:bg-white print:static print:z-0">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:w-full">
            
            {/* Modal Controls - Hidden during print */}
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0 print:hidden rounded-t-xl">
              <h3 className="font-bold">Payslip Preview</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleDownloadPDF}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-semibold transition-colors cursor-pointer"
                >
                  <Download size={18} /> Download
                </button>
                <button 
                  onClick={handlePrint}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg flex items-center gap-2 font-semibold transition-colors cursor-pointer"
                >
                  <Printer size={18} /> Print
                </button>
                <button onClick={() => setShowPayslipModal(null)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors ml-2 cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-700 p-8 print:p-0 print:bg-white custom-scrollbar">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-10 print:border-none print:p-0 mx-auto max-w-3xl">
                
                {/* Header */}
                <div className="text-center pb-8 border-b border-slate-200 dark:border-slate-700">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-wider">{userProfile?.schoolName || 'SCHOOL MANAGEMENT SYSTEM'}</h1>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">Monthly Salary Slip</p>
                  <div className="inline-block mt-3 px-4 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                    Period: {showPayslipModal.month}
                  </div>
                </div>

                {/* Employee Details Grid */}
                <div className="grid grid-cols-2 gap-6 my-8 text-sm">
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Employee Name</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-base">{showPayslipModal.staffProfile?.name || showPayslipModal.name}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Role / Designation</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{showPayslipModal.staffProfile?.designation || showPayslipModal.role || 'Staff'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Payment Status</p>
                    <span className="font-bold text-emerald-600 uppercase">{showPayslipModal.status}</span>
                  </div>
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Generated Date</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{showPayslipModal.createdAt ? new Date(showPayslipModal.createdAt).toLocaleDateString('en-GB') : 'N/A'}</p>
                  </div>
                </div>

                {/* Financial Table */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="p-3.5">Earnings / Credits</th>
                        <th className="p-3.5 text-right">Amount (₹)</th>
                        <th className="p-3.5 border-l border-slate-200 dark:border-slate-700">Deductions</th>
                        <th className="p-3.5 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      <tr>
                        <td className="p-3.5 font-medium text-slate-700 dark:text-slate-300">Base Salary</td>
                        <td className="p-3.5 text-right font-bold text-slate-900 dark:text-white">₹{Number(showPayslipModal.baseSalary || 0).toLocaleString()}</td>
                        <td className="p-3.5 border-l border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300">Provident Fund (PF)</td>
                        <td className="p-3.5 text-right font-semibold text-red-600">-₹{Number(showPayslipModal.pfCalculated || 0).toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-slate-700 dark:text-slate-300">-</td>
                        <td className="p-3.5 text-right font-bold text-slate-900 dark:text-white">-</td>
                        <td className="p-3.5 border-l border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300">ESI Deduction</td>
                        <td className="p-3.5 text-right font-semibold text-red-600">-₹{Number(showPayslipModal.esiCalculated || 0).toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-slate-700 dark:text-slate-300">-</td>
                        <td className="p-3.5 text-right font-bold text-slate-900 dark:text-white">-</td>
                        <td className="p-3.5 border-l border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300">Other Deductions</td>
                        <td className="p-3.5 text-right font-semibold text-red-600">
                          -₹{Math.max(0, Number(showPayslipModal.deductions || 0) - Number(showPayslipModal.pfCalculated || 0) - Number(showPayslipModal.esiCalculated || 0)).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t border-slate-200 dark:border-slate-700 text-sm">
                        <td className="p-3.5 text-slate-900 dark:text-white">Gross Earnings</td>
                        <td className="p-3.5 text-right text-slate-900 dark:text-white">₹{Number(showPayslipModal.baseSalary || 0).toLocaleString()}</td>
                        <td className="p-3.5 border-l border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">Total Deductions</td>
                        <td className="p-3.5 text-right text-red-600">-₹{Number(showPayslipModal.deductions || 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Net Pay Box */}
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-6 mb-12 flex justify-between items-center">
                  <div>
                    <p className="text-emerald-800 dark:text-emerald-300 font-bold text-sm uppercase tracking-wider">Net Payable Amount</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Transferred to registered bank account</p>
                  </div>
                  <h2 className="text-3xl font-black text-emerald-700 dark:text-emerald-300">
                    ₹{Number(showPayslipModal.netPay !== undefined ? showPayslipModal.netPay : Number(showPayslipModal.baseSalary || 0) - Number(showPayslipModal.deductions || 0)).toLocaleString()}
                  </h2>
                </div>

                {/* Signatures */}
                <div className="pt-12 border-t border-slate-200 dark:border-slate-700 flex justify-between items-end">
                  <div className="text-center">
                    <div className="w-40 border-b border-slate-300 dark:border-slate-600 mb-2"></div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Employee Signature</p>
                  </div>

                  <div className="text-center">
                    {hrConfig?.authorizedSignature ? (
                      <div className="mb-2 flex flex-col items-center">
                        <img src={hrConfig.authorizedSignature} alt="Authorized Signature" className="max-h-12 object-contain mix-blend-multiply" />
                        <div className="w-40 border-b border-slate-300 dark:border-slate-600 mt-1"></div>
                      </div>
                    ) : (
                      <div className="w-40 border-b border-slate-300 dark:border-slate-600 mb-2"></div>
                    )}
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Authorized Signatory</p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
