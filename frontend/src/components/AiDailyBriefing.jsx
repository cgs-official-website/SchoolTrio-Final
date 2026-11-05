import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import usePermissions from '../hooks/usePermissions';
import { getAiBriefing } from '../api/dashboard';
import { 
  LuSparkles as Sparkles, 
  LuRefreshCw as RefreshCw, 
  LuArrowRight as ArrowRight, 
  LuCheck as Check, 
  LuLightbulb as Lightbulb,
  LuBot as Bot
} from 'react-icons/lu';

export default function AiDailyBriefing({ stats = {}, className = '' }) {
  const { userProfile } = useAuth();
  const { permissions, isUnrestricted, roles, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const activeRoleName = roles?.[0]?.name || userProfile?.role || 'Staff';
  const userName = userProfile?.fullName || userProfile?.name || userProfile?.email?.split('@')[0] || 'User';

  const fetchBriefing = useCallback(async (isManualRefresh = false) => {
    if (!userProfile?.schoolId || permissionsLoading) return;

    if (isManualRefresh) {
      setLoading(true);
    }

    try {
      // Determine permitted module keys for this session
      let permittedModules = 'ALL';
      if (!isUnrestricted && permissions && typeof permissions === 'object') {
        permittedModules = Object.keys(permissions).filter(k => permissions[k]?.canRead || permissions[k]?.read);
      }

      const res = await getAiBriefing({
        role: userProfile?.role,
        userName,
        permittedModules,
        stats
      });

      if (res?.data) {
        startTransition(() => {
          setBriefing(res.data);
        });
      }
    } catch (err) {
      console.warn('[AiDailyBriefing] Failed to fetch AI briefing, keeping previous state if available:', err);
    } finally {
      setLoading(false);
    }
  }, [userProfile?.schoolId, userProfile?.role, userName, permissionsLoading, isUnrestricted, permissions, stats]);

  useEffect(() => {
    let isMounted = true;
    if (userProfile?.schoolId && !permissionsLoading) {
      fetchBriefing();
    }
    return () => {
      isMounted = false;
    };
  }, [userProfile?.schoolId, permissionsLoading]);

  if (loading && !briefing) {
    return (
      <div className={`rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-white dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900 p-6 shadow-sm animate-pulse ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-full bg-indigo-200 dark:bg-indigo-800"></div>
            <div className="h-4 w-32 rounded bg-indigo-200 dark:bg-indigo-800"></div>
          </div>
          <div className="h-4 w-20 rounded bg-indigo-100 dark:bg-slate-800"></div>
        </div>
        <div className="h-5 w-3/4 rounded bg-indigo-200 dark:bg-indigo-900 mb-4"></div>
        <div className="space-y-2">
          <div className="h-3.5 w-full rounded bg-indigo-100 dark:bg-slate-800"></div>
          <div className="h-3.5 w-5/6 rounded bg-indigo-100 dark:bg-slate-800"></div>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-indigo-100/80 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/70 via-purple-50/30 to-white dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 p-6 shadow-sm transition-all hover:shadow-md ${className}`}>
      {/* Decorative subtle background orb */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-200/30 dark:bg-indigo-600/10 blur-2xl"></div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-indigo-100/60 dark:border-indigo-900/30 pb-3 mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            AI Work Assistant
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
            {activeRoleName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Bot className="h-3.5 w-3.5 text-indigo-500" />
            Gemini 3.5 AI
          </span>
          <button
            onClick={() => fetchBriefing(true)}
            disabled={loading || isPending}
            title="Refresh AI briefing"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors disabled:opacity-50"
            aria-label="Refresh AI briefing"
          >
            <RefreshCw className={`h-3 w-3 ${loading || isPending ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="relative z-10 space-y-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{briefing.greeting || `Welcome, ${userName}`}</span>
          </h2>
          {briefing.headline && (
            <p className="text-sm font-medium text-indigo-900/80 dark:text-indigo-200/90 mt-0.5">
              {briefing.headline}
            </p>
          )}
        </div>

        {Array.isArray(briefing.highlights) && briefing.highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {briefing.highlights.map((highlight, idx) => (
              <div 
                key={idx} 
                className="flex items-start gap-2.5 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-indigo-50 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs"
              >
                <div className="h-4 w-4 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span className="leading-relaxed">{highlight}</span>
              </div>
            ))}
          </div>
        )}

        {Array.isArray(briefing.quickActions) && briefing.quickActions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100/40 dark:border-slate-800/60 mt-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              Suggested Next Steps:
            </span>
            {briefing.quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => navigate(action.path)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] ${
                  action.type === 'primary' || idx === 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{action.label}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

