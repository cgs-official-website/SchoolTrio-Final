import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuCalendarDays, LuClock, LuBookOpen, LuUser, LuCoffee, LuUtensils } from 'react-icons/lu';
import { getClassTimetable, getTimetableTemplate } from '../../api/timetables';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import toast from 'react-hot-toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_WEEK = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };

const formatTime12hr = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  let hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${m} ${period}`;
};

const subjectOf = (p) => p.subjectName || p.subject?.name || (typeof p.subject === 'string' ? p.subject : '') || 'Subject';
const teacherOf = (p) => p.teacherName || p.teacher?.name || (typeof p.teacher === 'string' ? p.teacher : '') || '';

export default function ParentTimetable() {
  const { activeChild } = useOutletContext() || {};
  const classId = activeChild?.classId || activeChild?.class?.id || '';
  const sectionId = activeChild?.sectionId || activeChild?.section?.id || null;
  const childLabel = [activeChild?.class?.name, activeChild?.section?.name].filter(Boolean).join(' - ');

  const [schedule, setSchedule] = useState(EMPTY_WEEK);
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // JS getDay(): 0 = Sunday. Our week starts at Monday.
  const todayName = DAYS[new Date().getDay() - 1] || null;

  const load = useCallback(async (showSpinner = true) => {
    const id = ++seq.current;
    if (!classId) {
      setSchedule(EMPTY_WEEK);
      setLoading(false);
      return;
    }
    if (showSpinner) {
      setSchedule(EMPTY_WEEK); // never show the previous child's data
      setLoading(true);
    }
    try {
      const [tt, tpl] = await Promise.all([
        getClassTimetable(classId, { sectionId }),
        getTimetableTemplate().catch(() => null)
      ]);
      if (id !== seq.current) return;
      const grid = tt?.data?.schedule || {};
      const normalized = {};
      DAYS.forEach((d) => { normalized[d] = Array.isArray(grid[d]) ? grid[d] : []; });
      setSchedule(normalized);
      setTemplate(tpl?.data || null);
    } catch (err) {
      if (id !== seq.current) return;
      console.error('Error loading timetable:', err);
      toast.error(err.message || 'Failed to load timetable.');
      setSchedule(EMPTY_WEEK);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [classId, sectionId]);

  useEffect(() => { load(true); }, [load]);
  useLiveDataRefresh(() => load(false), [load], ['timetables', 'timetable']);

  // Link a period to its template slot (legacy periods are matched by identical times)
  const slotIdOf = (p) => {
    if (p?.templateSlotId) return p.templateSlotId;
    return template?.slots?.find(
      (s) => s.slotType === 'PERIOD' && s.startTime === p?.startTime && s.endTime === p?.endTime
    )?.id || null;
  };

  const hasAnyPeriod = DAYS.some((d) => schedule[d].length > 0);

  const PeriodCard = ({ p }) => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm h-full">
      <div className="font-bold text-slate-900 dark:text-white flex items-start gap-1.5 leading-tight break-words">
        <LuBookOpen size={14} className="text-primary-500 shrink-0 mt-0.5" />
        {subjectOf(p)}
      </div>
      {teacherOf(p) && (
        <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg inline-flex items-center gap-1.5 border border-slate-100 dark:border-slate-800 max-w-full">
          <LuUser size={12} className="text-slate-400 dark:text-slate-300 shrink-0" />
          <span className="truncate">{teacherOf(p)}</span>
        </div>
      )}
    </div>
  );

  if (!activeChild) {
    return (
      <div className="p-4 sm:p-8 text-center text-slate-500 dark:text-slate-400 font-semibold">
        Select a child to view the timetable.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full flex flex-col min-w-0 w-full">
      <div className="mb-8 shrink-0">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <LuCalendarDays className="text-primary-600 shrink-0" /> Timetable
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Weekly schedule for {activeChild.name}{childLabel ? ` (${childLabel})` : ''}
        </p>
      </div>

      <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
          </div>
        )}

        {!loading && !hasAnyPeriod ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 py-16">
            <LuCalendarDays size={40} className="mb-3 opacity-60" />
            <p className="font-bold">No timetable has been published for this section yet.</p>
          </div>
        ) : template ? (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="min-w-[980px]">
              <div
                className="grid bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10"
                style={{ gridTemplateColumns: '150px repeat(6, minmax(0, 1fr))' }}
              >
                <div className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-300">Period</div>
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className={`p-4 text-center font-bold uppercase tracking-wider text-sm border-l border-slate-200 dark:border-slate-700 ${day === todayName ? 'text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30' : 'text-slate-700 dark:text-slate-200'}`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {template.slots.map((tSlot) => {
                if (tSlot.slotType !== 'PERIOD') {
                  return (
                    <div key={tSlot.id} className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs font-bold">
                      {tSlot.slotType === 'LUNCH' ? <LuUtensils size={14} /> : <LuCoffee size={14} />}
                      {tSlot.label} · {formatTime12hr(tSlot.startTime)} - {formatTime12hr(tSlot.endTime)}
                    </div>
                  );
                }
                return (
                  <div
                    key={tSlot.id}
                    className="grid border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                    style={{ gridTemplateColumns: '150px repeat(6, minmax(0, 1fr))' }}
                  >
                    <div className="p-3 bg-white dark:bg-slate-900">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{tSlot.label}</div>
                      <div className="text-xs font-semibold text-primary-600 mt-1 flex items-center gap-1.5">
                        <LuClock size={12} />
                        {formatTime12hr(tSlot.startTime)} - {formatTime12hr(tSlot.endTime)}
                      </div>
                    </div>
                    {DAYS.map((day) => {
                      const p = schedule[day].find((x) => slotIdOf(x) === tSlot.id);
                      return (
                        <div key={day} className="p-2 border-l border-slate-200 dark:border-slate-700 min-h-[80px]">
                          {p ? (
                            <PeriodCard p={p} />
                          ) : (
                            <div className="h-full min-h-[64px] flex items-center justify-center text-xs text-slate-300 dark:text-slate-500 font-semibold">—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Periods whose timings match no template slot */}
              {(() => {
                const others = DAYS.flatMap((day) => schedule[day].filter((p) => !slotIdOf(p)).map((p) => ({ day, p })));
                if (others.length === 0) return null;
                return (
                  <div className="m-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Other periods</h4>
                    <div className="space-y-2">
                      {others.map(({ day, p }) => (
                        <div key={`${day}-${p.id}`} className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                          {day} · {formatTime12hr(p.startTime)} - {formatTime12hr(p.endTime)} · {subjectOf(p)}{teacherOf(p) ? ` · ${teacherOf(p)}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          /* No template yet: simple day columns */
          <div className="flex-1 overflow-auto p-2 sm:p-6 custom-scrollbar">
            <div className="grid grid-cols-1 xl:grid-cols-6 gap-6 min-w-[1000px] xl:min-w-0 items-start">
              {DAYS.map((day) => (
                <div key={day} className="flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                  <div className="text-center pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className={`text-lg font-black ${day === todayName ? 'text-primary-600' : 'text-slate-900 dark:text-white'}`}>{day}</h3>
                  </div>
                  <div className="space-y-3">
                    {schedule[day].length > 0 ? schedule[day].map((p) => (
                      <div key={p.id}>
                        <div className="text-xs font-bold text-primary-600 mb-1 flex items-center gap-1.5">
                          <LuClock size={12} />
                          {formatTime12hr(p.startTime)} - {formatTime12hr(p.endTime)}
                        </div>
                        <PeriodCard p={p} />
                      </div>
                    )) : (
                      <p className="text-sm font-bold text-slate-400 dark:text-slate-300 text-center py-6 opacity-60">No Classes</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}