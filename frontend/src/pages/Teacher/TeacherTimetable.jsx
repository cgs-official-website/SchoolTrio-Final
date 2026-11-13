import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LuCalendarDays, LuClock, LuBookOpen, LuUser, LuCoffee, LuUtensils, LuDownload as LuFileDown, LuX } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import { getMyTimetable, getTimetableTemplate } from '../../api/timetables';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import * as XLSX from 'xlsx';
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

// "V" + section "B" -> "V - B" (falls back to class name only when the period has no section)
const getClassLabel = (slot) => {
  const cls = slot.className || (typeof slot.class === 'object' && slot.class !== null ? (slot.class.name || '') : (slot.class || ''));
  const sec = slot.sectionName || (typeof slot.section === 'object' && slot.section !== null ? (slot.section.name || '') : (slot.section || ''));
  return [cls, sec].filter(Boolean).join(' - ');
};

const subjectOf = (p) => p.subjectName || (typeof p.subject === 'object' && p.subject !== null ? (p.subject.name || p.subject.code || '') : (p.subject || '')) || 'Subject';
const teacherOf = (p) => p.teacherName || (typeof p.teacher === 'object' && p.teacher !== null ? (p.teacher.name || '') : (p.teacher || ''));

export default function TeacherTimetable() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;

  const [viewType, setViewType] = useState('subject'); // 'subject' or 'class'
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [classTimetable, setClassTimetable] = useState(EMPTY_WEEK);
  const [subjectTimetable, setSubjectTimetable] = useState(EMPTY_WEEK);
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [selectedFields, setSelectedFields] = useState({
    time: true,
    subject: true,
    class: true,
    room: true,
    teacher: true
  });

  const availableFieldsList = [
    { key: 'time', label: 'Time Slot' },
    { key: 'subject', label: 'Subject Name' },
    { key: 'class', label: 'Class / Section' },
    { key: 'room', label: 'Room / Location' },
    { key: 'teacher', label: 'Teacher Name' }
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

  const schedule = useMemo(
    () => (viewType === 'class' && isClassTeacher ? classTimetable : subjectTimetable),
    [viewType, isClassTeacher, classTimetable, subjectTimetable]
  );
  const showingClassView = viewType === 'class' && isClassTeacher;

  const todayName = DAYS[new Date().getDay() - 1] || null;

  const handleExport = () => {
    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error("Please select at least one column to export.");
      return;
    }

    const exportData = [];
    DAYS.forEach(day => {
      (schedule[day] || []).forEach(slot => {
        const row = { "Day": day };
        const timeStr = slot.time || `${formatTime12hr(slot.startTime)} - ${formatTime12hr(slot.endTime)}`;
        const roomStr = slot.roomNumber || slot.room || '';

        if (selectedFields.time) row["Time Slot"] = timeStr;
        if (selectedFields.subject) row["Subject Name"] = subjectOf(slot);
        if (selectedFields.class) row["Class / Section"] = getClassLabel(slot);
        if (selectedFields.room) row["Room / Location"] = roomStr;
        if (selectedFields.teacher) row["Teacher Name"] = teacherOf(slot) || 'Unassigned';

        exportData.push(row);
      });
    });

    if (exportData.length === 0) {
      toast.error("No timetable data available to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Timetable");

    const rawName = exportFileName.trim() || (showingClassView ? "My_Class_Timetable" : "My_Subject_Timetable");
    const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;

    XLSX.writeFile(workbook, finalFileName);
    setShowExportModal(false);
    toast.success("Timetable exported successfully!");
  };

  const fetchMyTimetable = useCallback(async () => {
    try {
      const [res, tpl] = await Promise.all([
        getMyTimetable(),
        getTimetableTemplate().catch(() => null)
      ]);
      const data = res.data || {};
      setIsClassTeacher(Boolean(data.isClassTeacher));
      setSubjectTimetable(data.subjectSchedule || EMPTY_WEEK);
      setClassTimetable(data.classSchedule || EMPTY_WEEK);
      setTemplate(tpl?.data || null);
    } catch (err) {
      console.error("Error loading teacher timetable:", err);
      toast.error(err.message || "Failed to load timetable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schoolId) {
      fetchMyTimetable();
    }
  }, [schoolId, fetchMyTimetable]);

  // Live data synchronization for timetables
  useLiveDataRefresh(fetchMyTimetable, [fetchMyTimetable], ['timetables', 'timetable']);

  const slotIdOf = (p) => {
    if (p?.templateSlotId) return p.templateSlotId;
    return template?.slots?.find(
      (s) => s.slotType === 'PERIOD' && s.startTime === p?.startTime && s.endTime === p?.endTime
    )?.id || null;
  };

  const PeriodCard = ({ p }) => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm h-full min-w-0">
      <div className="font-bold text-slate-900 dark:text-white flex items-start gap-1.5 leading-tight break-words [overflow-wrap:anywhere]">
        <LuBookOpen size={14} className="text-primary-500 shrink-0 mt-0.5" />
        {subjectOf(p)}
      </div>
      {showingClassView ? (
        teacherOf(p) && (
          <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg inline-flex items-center gap-1.5 border border-slate-100 dark:border-slate-800 max-w-full">
            <LuUser size={12} className="text-slate-400 dark:text-slate-300 shrink-0" />
            <span className="truncate">{teacherOf(p)}</span>
          </div>
        )
      ) : (
        getClassLabel(p) && (
          <div className="mt-2 text-xs font-semibold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-2 py-1 rounded-lg inline-block max-w-full truncate">
            {getClassLabel(p)}
          </div>
        )
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  const hasAnyPeriod = DAYS.some((d) => (schedule[d] || []).length > 0);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full flex flex-col min-w-0 w-full">
      <div className="mb-8 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 truncate">
            <LuCalendarDays className="text-primary-600 shrink-0" /> My Timetable
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View your weekly class schedule and teaching periods.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {isClassTeacher && (
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold shadow-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="subject">My Subject Timetable</option>
              <option value="class">My Class Timetable</option>
            </select>
          )}
          <button
            onClick={() => {
              if (!hasAnyPeriod) {
                toast.error("No timetable data available to export.");
                return;
              }
              setExportFileName(showingClassView ? "My_Class_Timetable" : "My_Subject_Timetable");
              setShowExportModal(true);
            }}
            className="w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-md shadow-primary-600/10 transition-all active:scale-[0.98]"
          >
            <LuFileDown size={18} />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {!hasAnyPeriod ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 py-16">
            <LuCalendarDays size={40} className="mb-3 opacity-60" />
            <p className="font-bold">No classes scheduled yet.</p>
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
                      const matches = (schedule[day] || []).filter((x) => slotIdOf(x) === tSlot.id);
                      return (
                        <div key={day} className="p-2 border-l border-slate-200 dark:border-slate-700 min-h-[80px] space-y-2">
                          {matches.length > 0 ? (
                            matches.map((p) => <PeriodCard key={p.id} p={p} />)
                          ) : (
                            <div className="h-full min-h-[64px] flex items-center justify-center text-xs text-slate-300 dark:text-slate-500 font-semibold">
                              {showingClassView ? '—' : 'Free'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {(() => {
                const others = DAYS.flatMap((day) => (schedule[day] || []).filter((p) => !slotIdOf(p)).map((p) => ({ day, p })));
                if (others.length === 0) return null;
                return (
                  <div className="m-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Other periods</h4>
                    <div className="space-y-2">
                      {others.map(({ day, p }) => (
                        <div key={`${day}-${p.id}`} className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                          {day} · {formatTime12hr(p.startTime)} - {formatTime12hr(p.endTime)} · {subjectOf(p)}
                          {showingClassView
                            ? (teacherOf(p) ? ` · ${teacherOf(p)}` : '')
                            : (getClassLabel(p) ? ` · ${getClassLabel(p)}` : '')}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-2 sm:p-6 custom-scrollbar">
            <div className="grid grid-cols-1 xl:grid-cols-6 gap-6 min-w-[1000px] xl:min-w-0 items-start">
              {DAYS.map((day) => (
                <div key={day} className="flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                  <div className="text-center pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className={`text-lg font-black ${day === todayName ? 'text-primary-600' : 'text-slate-900 dark:text-white'}`}>{day}</h3>
                  </div>
                  <div className="space-y-3">
                    {(schedule[day] || []).length > 0 ? schedule[day].map((p) => (
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

      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Export Timetable</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">Select columns to include in the exported Excel spreadsheet</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div className="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">File Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. My_Class_Timetable"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-semibold"
                  />
                  <span className="absolute right-4 top-2.5 text-xs text-slate-400 dark:text-slate-300 font-bold font-mono select-none">.xlsx</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="px-3 py-1.5 text-xs font-bold bg-primary-50 text-primary-700 hover:bg-primary-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Deselect All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {availableFieldsList.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 cursor-pointer select-none transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields[field.key]}
                      onChange={() => handleFieldToggle(field.key)}
                      className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
              >
                <LuFileDown size={18} />
                Generate Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}