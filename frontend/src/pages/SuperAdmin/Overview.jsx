import React, { useState, useEffect } from 'react';
import { getStats, listTenants } from '../../api/superadmin';
import { LuBuilding2 as Building2, LuTrendingUp as TrendingUp, LuCircleAlert as AlertCircle, LuCircleCheck as CheckCircle2 } from 'react-icons/lu';
import { Link } from 'react-router-dom';

export default function Overview() {
  const [stats, setStats] = useState({
    activeSchools: 0,
    pendingSchools: 0,
    suspendedSchools: 0,
    estimatedMRR: 0
  });
  const [recentSchools, setRecentSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadOverviewData = async () => {
      setLoading(true);
      try {
        const [statsRes, tenantsRes] = await Promise.all([
          getStats().catch(() => ({ data: null })),
          listTenants({ limit: 5 }).catch(() => ({ data: null }))
        ]);

        if (!isMounted) return;

        const rawStats = statsRes?.data || statsRes || {};
        setStats({
          activeSchools: rawStats.activeSchools || 0,
          pendingSchools: rawStats.pendingSchools || 0,
          suspendedSchools: rawStats.suspendedSchools || 0,
          estimatedMRR: rawStats.estimatedMRR || 0
        });

        const rawTenants = tenantsRes?.data?.tenants || (Array.isArray(tenantsRes?.data) ? tenantsRes.data : []);
        setRecentSchools(rawTenants);
      } catch (err) {
        console.error('Error loading SuperAdmin overview stats:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadOverviewData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto pb-24">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Global Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Platform analytics and tenant metrics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Building2 size={24} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Total Active Schools</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white">{stats.activeSchools}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
              <TrendingUp size={24} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Monthly Recurring Revenue</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white">₹{stats.estimatedMRR.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <AlertCircle size={24} />
            </div>
            {stats.pendingSchools > 0 && (
              <span className="flex h-3 w-3 absolute top-6 right-6">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Pending Approvals</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white">{stats.pendingSchools}</h3>
            {stats.pendingSchools > 0 && (
              <Link to="/superadmin/tenants" className="text-xs text-primary-600 font-bold hover:underline mt-2 inline-block">Review Now &rarr;</Link>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <AlertCircle size={24} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Suspended Tenants</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white">{stats.suspendedSchools}</h3>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Registrations</h2>
          <Link to="/superadmin/tenants" className="text-sm font-bold text-primary-600 hover:text-primary-700">View All Tenants</Link>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentSchools.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">No schools registered yet.</div>
          ) : (
            recentSchools.map(school => {
              const displayName = school.name || school.schoolName || 'Unnamed School';
              const planName = school.plan?.name || school.plan || 'Standard';
              const statusNormalized = (school.status || 'pending').toLowerCase();
              return (
                <div key={school.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center font-bold text-slate-500 dark:text-slate-400">
                      {displayName.charAt(0) || 'S'}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{displayName}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{new Date(school.createdAt).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {planName}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1
                      ${statusNormalized === 'approved' ? 'bg-green-100 text-green-700' : 
                        statusNormalized === 'pending' ? 'bg-amber-100 text-amber-700' : 
                        'bg-red-100 text-red-700'}`}
                    >
                      {statusNormalized === 'approved' && <CheckCircle2 size={12} />}
                      {statusNormalized === 'pending' && <AlertCircle size={12} />}
                      {statusNormalized.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
