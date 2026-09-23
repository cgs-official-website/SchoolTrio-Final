import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMySalary, getConfig } from '../../api/hr-payroll';
import { LuBanknote } from 'react-icons/lu';
import { Printer, X, FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

export default function MySalary() {
  const { userProfile } = useAuth();
  
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hrConfig, setHrConfig] = useState({ authorizedSignature: null });
  const [showPayslipModal, setShowPayslipModal] = useState(null);

  const fetchSalaryData = useCallback(async () => {
    try {
      setLoading(true);
      const [salaryRes, configRes] = await Promise.allSettled([
        getMySalary(),
        getConfig()
      ]);

      if (salaryRes.status === 'fulfilled' && salaryRes.value?.data) {
        setPayrolls(salaryRes.value.data);
      } else if (salaryRes.status === 'rejected') {
        console.error("Failed to fetch my salary", salaryRes.reason);
        toast.error(salaryRes.reason?.message || "Failed to load salary history");
      }

      if (configRes.status === 'fulfilled' && configRes.value?.data) {
        setHrConfig(configRes.value.data);
      }
    } catch (err) {
      console.error("Error loading salary data", err);
      toast.error("Failed to load salary information");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalaryData();
  }, [fetchSalaryData]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    if (!showPayslipModal) return;
    const payroll = showPayslipModal;
    const staff = payroll.staffProfile || {};
    const docPDF = new jsPDF();
    const baseSalary = Number(payroll.baseSalary || 0);
    const deductions = Number(payroll.deductions || 0);
    const netPay = Number(payroll.netPay !== undefined ? payroll.netPay : baseSalary - deductions);
    const staffName = staff.name || payroll.name || userProfile?.name || 'Staff Member';
    const staffRole = staff.designation || payroll.role || userProfile?.role || 'Staff';

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

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex justify-center items-center h-64">
        <div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto h-[calc(100vh-2rem)] flex flex-col print:p-0 print:h-auto">
      <div className="mb-8 shrink-0 print:hidden">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
            <LuBanknote size={28} />
          </div>
          My Salary & Payslips
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">View your monthly salary details, deductions, and download payslips.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden print:hidden">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
              <tr>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Month</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Base Salary</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Total Deductions</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Net Pay</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Status</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {payrolls.map((payroll) => {
                const baseSalary = Number(payroll.baseSalary || 0);
                const deductions = Number(payroll.deductions || 0);
                const netPay = Number(payroll.netPay !== undefined ? payroll.netPay : baseSalary - deductions);
                const pf = Number(payroll.pfCalculated || 0);
                const esi = Number(payroll.esiCalculated || 0);

                return (
                  <tr key={payroll.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-900 dark:text-white">{payroll.month || 'N/A'}</td>
                    <td className="p-4 text-slate-700 dark:text-slate-200 font-medium">₹{baseSalary.toLocaleString()}</td>
                    <td className="p-4 text-red-600 font-medium">
                      -₹{deductions.toLocaleString()}
                      <div className="text-[10px] text-slate-400 dark:text-slate-300 mt-0.5">
                        PF: ₹{pf} | ESI: ₹{esi}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-emerald-600 text-lg">₹{netPay.toLocaleString()}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        payroll.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                        payroll.status === 'Payslip Released' ? 'bg-purple-100 text-purple-700' : 
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {payroll.status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {payroll.status === 'Payslip Released' ? (
                        <button 
                          onClick={() => setShowPayslipModal(payroll)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 text-sm font-bold hover:bg-purple-100 rounded-lg transition-colors shadow-sm cursor-pointer"
                        >
                          <FileText size={16} /> Payslip
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-300 font-medium italic px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg">Not Released</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payrolls.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <LuBanknote size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-900 dark:text-white mb-1">No Payroll Records</p>
                    <p>Your salary records will appear here once processed by the admin.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <div className="flex justify-between items-center border-b-2 border-slate-200 dark:border-slate-700 pb-6 mb-8">
                  <div className="flex items-center gap-4">
                    {userProfile?.schoolLogoUrl ? (
                      <img src={userProfile.schoolLogoUrl} alt="School Logo" className="h-16 w-16 object-contain" />
                    ) : (
                      <div className="h-16 w-16 bg-slate-100 dark:bg-slate-700 rounded flex items-center justify-center font-bold text-slate-400 dark:text-slate-300">LOGO</div>
                    )}
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">{userProfile?.schoolName || 'School Name'}</h1>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{userProfile?.schoolAddress || 'School Address'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-3xl font-black text-slate-300 uppercase tracking-widest">Payslip</h2>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold mt-1">{showPayslipModal.month}</p>
                  </div>
                </div>

                {/* Employee Details */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-3">Employee Details</h3>
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Name: <span className="text-slate-900 dark:text-white font-bold ml-1">{showPayslipModal.staffProfile?.name || showPayslipModal.name || userProfile?.name}</span></p>
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Role/Designation: <span className="text-slate-900 dark:text-white font-semibold ml-1">{showPayslipModal.staffProfile?.designation || showPayslipModal.role || userProfile?.role}</span></p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-3">Payment Details</h3>
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Status: <span className="text-emerald-600 font-bold ml-1">{showPayslipModal.status}</span></p>
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Date: <span className="text-slate-900 dark:text-white font-semibold ml-1">{new Date().toLocaleDateString('en-GB')}</span></p>
                    </div>
                  </div>
                </div>

                {/* Salary Breakdown Table */}
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-3">Salary Breakdown</h3>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-8">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-3 px-4 text-slate-600 dark:text-slate-300 font-bold w-1/2">Earnings</th>
                        <th className="py-3 px-4 text-slate-600 dark:text-slate-300 font-bold w-1/2 border-l border-slate-200 dark:border-slate-700">Deductions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-3 px-4 align-top">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-slate-700 dark:text-slate-200">Basic Salary</span>
                            <span className="font-semibold">₹{Number(showPayslipModal.baseSalary || 0).toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top border-l border-slate-200 dark:border-slate-700">
                          {Number(showPayslipModal.pfCalculated || 0) > 0 && (
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-700 dark:text-slate-200">Provident Fund (PF)</span>
                              <span className="font-semibold text-red-600">₹{Number(showPayslipModal.pfCalculated).toLocaleString()}</span>
                            </div>
                          )}
                          {Number(showPayslipModal.esiCalculated || 0) > 0 && (
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-700 dark:text-slate-200">ESI</span>
                              <span className="font-semibold text-red-600">₹{Number(showPayslipModal.esiCalculated).toLocaleString()}</span>
                            </div>
                          )}
                          {(Number(showPayslipModal.deductions || 0) - Number(showPayslipModal.pfCalculated || 0) - Number(showPayslipModal.esiCalculated || 0)) > 0 && (
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-700 dark:text-slate-200">Other Deductions</span>
                              <span className="font-semibold text-red-600">₹{(Number(showPayslipModal.deductions || 0) - Number(showPayslipModal.pfCalculated || 0) - Number(showPayslipModal.esiCalculated || 0)).toLocaleString()}</span>
                            </div>
                          )}
                          {Number(showPayslipModal.deductions || 0) === 0 && (
                            <div className="text-slate-400 dark:text-slate-300 text-sm italic">No deductions</div>
                          )}
                        </td>
                      </tr>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-700">
                        <td className="py-3 px-4">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900 dark:text-white">Gross Earnings</span>
                            <span className="font-bold text-slate-900 dark:text-white">₹{Number(showPayslipModal.baseSalary || 0).toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-l border-slate-200 dark:border-slate-700">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900 dark:text-white">Total Deductions</span>
                            <span className="font-bold text-red-600">₹{Number(showPayslipModal.deductions || 0).toLocaleString()}</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Net Pay & Signature */}
                <div className="flex justify-between items-end mt-12 border-t-2 border-slate-900 dark:border-slate-600 pt-6">
                  <div>
                    <h4 className="text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-widest text-sm">Net Pay</h4>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">₹{(Number(showPayslipModal.netPay !== undefined ? showPayslipModal.netPay : Number(showPayslipModal.baseSalary || 0) - Number(showPayslipModal.deductions || 0))).toLocaleString()}</p>
                    <p className="text-slate-400 dark:text-slate-300 text-sm mt-2 italic">*This is a computer generated document.</p>
                  </div>
                  
                  <div className="text-center w-48">
                    {hrConfig?.authorizedSignature ? (
                      <div className="h-16 mb-2 flex items-end justify-center">
                        <img src={hrConfig.authorizedSignature} alt="Authorized Signature" className="max-h-full object-contain mix-blend-multiply" />
                      </div>
                    ) : (
                      <div className="h-16 mb-2 border-b-2 border-dashed border-slate-300 dark:border-slate-600"></div>
                    )}
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">Authorized Signatory</p>
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
