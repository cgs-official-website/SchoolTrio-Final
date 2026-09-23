import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCurrentBilling, getPlans } from '../../api/billing';
import { useNavigate } from 'react-router-dom';
import {
  LuCreditCard as CreditCard,
  LuZap as Zap,
  LuCircleCheck as CheckCircle2,
  LuCircleAlert as AlertCircle,
  LuFileText as FileText,
  LuDownload as Download,
  LuShieldAlert as ShieldAlert,
  LuRefreshCw as RefreshCw
} from 'react-icons/lu';
import { TableSkeleton } from '../../components/Skeleton';

export default function BillingDashboard() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const navigate = useNavigate();

  const [billingData, setBillingData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invoices list - SaaS platform subscription invoicing is not yet implemented
  const invoices = [];

  const fetchBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const [billingRes, plansRes] = await Promise.all([
        getCurrentBilling(),
        getPlans().catch(() => ({ data: [] }))
      ]);

      setBillingData(billingRes?.data || null);
      setPlans(plansRes?.data || []);
    } catch (err) {
      console.error("Error fetching billing details:", err);
      setError(err?.message || "Failed to load subscription & billing details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [schoolId]);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  const currentPlan = billingData?.plan;
  const billingCycle = billingData?.billingCycle || 'monthly';
  const totalAmount = billingData?.calculatedTotalAmount ?? 0;
  const usage = billingData?.usage || {};

  const studentsCount = usage.students ?? 0;
  const staffCount = usage.staff ?? 0;
  const maxStudents = usage.seatLimit || currentPlan?.userLimit || 0;
  const maxStaff = usage.teacherLimit || (currentPlan?.userLimit ? Math.floor(currentPlan.userLimit * 0.1) : 0);

  const getPercentage = (used, max) => {
    if (!max || max <= 0) return 10;
    return Math.min(Math.round((used / max) * 100), 100);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Billing & Subscriptions</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your plan, limits, and billing history.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchBilling}
            className="px-3 py-1 bg-red-100 dark:bg-red-800/60 hover:bg-red-200 text-red-800 dark:text-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Col: Current Plan & Usage */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-50 rounded-full mix-blend-multiply opacity-50"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <p className="text-sm font-bold text-amber-600 uppercase tracking-wider mb-1">Current Plan</p>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {currentPlan?.name || 'Default Plan'}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2">
                  Billing cycle: <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">{billingCycle}</span> &middot; Status: <span className="font-semibold text-emerald-600 dark:text-emerald-400 capitalize">{billingData?.subscriptionStatus || 'Active'}</span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
                  ₹{totalAmount.toLocaleString('en-IN')}<span className="text-lg text-slate-500 dark:text-slate-400 font-medium">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                </div>
                <button 
                  onClick={() => navigate('/admin/upgrade')}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Zap size={16} /> Upgrade Plan
                </button>
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800 relative z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Current Usage</h3>
              
              {currentPlan ? (
                <>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Students</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-900 dark:text-white">{studentsCount}</span> / {maxStudents > 0 ? maxStudents : 'Unlimited'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${maxStudents > 0 && getPercentage(studentsCount, maxStudents) > 90 ? 'bg-red-500' : 'bg-primary-500'}`} 
                        style={{ width: `${getPercentage(studentsCount, maxStudents || 10000)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Staff Accounts</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-900 dark:text-white">{staffCount}</span> / {maxStaff > 0 ? maxStaff : 'Unlimited'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${maxStaff > 0 && getPercentage(staffCount, maxStaff) > 90 ? 'bg-red-500' : 'bg-primary-500'}`} 
                        style={{ width: `${getPercentage(staffCount, maxStaff || 1000)}%` }}
                      ></div>
                    </div>
                  </div>
                  {currentPlan.cloudStorageGB && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Cloud Storage</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-900 dark:text-white">{currentPlan.cloudStorageGB} GB</span> Allocated
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm">
                  You are currently on a free or unconfigured plan. Upgrade to unlock features.
                </div>
              )}
            </div>
          </div>

          {/* Invoices */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Billing History</h3>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                  <th className="p-4 pl-6">Invoice</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400 dark:text-slate-300 font-medium">
                      No invoices available.
                    </td>
                  </tr>
                ) : (
                  invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText size={16} className="text-slate-400 dark:text-slate-300" /> {inv.id}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">{new Date(inv.date).toLocaleDateString('en-GB')}</td>
                      <td className="p-4 font-semibold text-slate-900 dark:text-white">₹{inv.amount}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700">
                          <CheckCircle2 size={12} /> Paid
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                          <Download size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Payment Method & Support */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payment Method</h3>
            </div>
            
            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/40 text-primary-600 rounded-lg">
                  <CreditCard size={20} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Direct Institutional Billing</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Manual / Bank Transfer</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
                Subscription payments and annual institutional invoices are coordinated directly via institution billing contacts.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex gap-3 text-slate-700 dark:text-slate-200 mb-2">
              <AlertCircle size={20} className="text-amber-500 shrink-0" />
              <h3 className="font-bold text-slate-900 dark:text-white">Need Help?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 pl-8">
              If you have questions about your billing, limits, or need a custom enterprise plan, please contact our support team.
            </p>
            <button className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
