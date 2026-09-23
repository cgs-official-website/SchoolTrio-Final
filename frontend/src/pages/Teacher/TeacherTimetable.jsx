import React, { useState, useEffect, useCallback } from 'react';
import { LuCalendarDays, LuClock, LuBookOpen, LuMapPin, LuDownload as LuFileDown, LuX } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import { getMyTimetable } from '../../api/timetables';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const formatTime12hr = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  let hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${m} ${period}`;
};

export default function TeacherTimetable() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;

  const [currentWeek] = useState('This Week');
  const [viewType, setViewType] = useState('subject'); // 'subject' or 'class'
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [classTimetable, setClassTimetable] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
  });
  const [subjectTimetable, setSubjectTimetable] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
  });
  const [schedule, setSchedule] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
  });
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

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleExport = () => {
    const exportData = [];
    
    days.forEach(day => {
      const daySlots = schedule[day] || [];
      daySlots.forEach(slot => {
        const row = { "Day": day };
        const timeStr = slot.time || `${formatTime12hr(slot.startTime)} - ${formatTime12hr(slot.endTime)}`;
        const subjectStr = slot.subjectName || slot.subject || '';
        const classStr = slot.className || slot.class || '';
        const roomStr = slot.roomNumber || slot.room || 'Room (Auto)';
        const teacherStr = slot.teacherName || slot.teacher || 'Unassigned';
        
        if (selectedFields.time) row["Time Slot"] = timeStr;
        if (selectedFields.subject) row["Subject Name"] = subjectStr;
        if (selectedFields.class) row["Class / Section"] = classStr;
        if (selectedFields.room) row["Room / Location"] = roomStr;
        if (selectedFields.teacher) row["Teacher Name"] = teacherStr;
        
        exportData.push(row);
      });
    });

    if (exportData.length === 0) {
      toast.error("No timetable data available to export.");
      return;
    }

    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error("Please select at least one column to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Timetable");
    
    const rawName = exportFileName.trim() || (viewType === 'class' ? "My_Class_Timetable" : "My_Subject_Timetable");
    const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;
    
    XLSX.writeFile(workbook, finalFileName);
    setShowExportModal(false);
    toast.success("Timetable exported successfully!");
  };

  const fetchMyTimetable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyTimetable();
      const data = res.data || {};
      setIsClassTeacher(Boolean(data.isClassTeacher));
      
      const subSched = data.subjectSchedule || {
        Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
      };
      const clsSched = data.classSchedule || {
        Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
      };
      
      setSubjectTimetable(subSched);
      setClassTimetable(clsSched);
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

  useEffect(() => {
    if (viewType === 'class' && isClassTeacher) {
      setSchedule(classTimetable);
    } else {
      setSchedule(subjectTimetable);
    }
  }, [viewType, subjectTimetable, classTimetable, isClassTeacher]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

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
          <div className="w-full sm:w-auto text-center bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 shadow-sm">
            {currentWeek}
          </div>
          <button
            onClick={() => {
              const hasData = Object.values(schedule).some(slots => slots && slots.length > 0);
              if (!hasData) {
                toast.error("No timetable data available to export.");
                return;
              }
              setExportFileName(viewType === 'class' ? "My_Class_Timetable" : "My_Subject_Timetable");
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
        <div className="flex-1 overflow-auto p-2 sm:p-6 custom-scrollbar">
          <div className="grid grid-cols-1 xl:grid-cols-6 gap-6 min-w-[1000px] xl:min-w-0 items-start">
            {days.map(day => (
              <div key={day} className="flex flex-col bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <div className="text-center pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{day}</h3>
                </div>
                
                <div className="flex-1 space-y-4">
                  {schedule[day]?.length > 0 ? schedule[day].map(period => (
                    <div key={period.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-slate-700 hover:shadow-md transition-all group">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary-600 mb-2">
                        <LuClock size={14} />
                        {period.time || (period.startTime && period.endTime ? `${formatTime12hr(period.startTime)} - ${formatTime12hr(period.endTime)}` : '')}
                      </div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">{period.subjectName || period.subject?.name || period.subject || 'Subject'}</h4>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">{period.className || period.class?.name || period.class || ''}</p>
                      {viewType === 'class' && (period.teacherName || period.teacher?.name || period.teacher) && (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Teacher: {period.teacherName || period.teacher?.name || period.teacher}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <span className="flex items-center gap-1"><LuMapPin size={12} /> {period.roomNumber || period.room || 'Room (Auto)'}</span>
                        <span className="flex items-center gap-1 text-primary-500 group-hover:text-primary-600 cursor-pointer"><LuBookOpen size={12} /> Prep</span>
                      </div>
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 py-10 opacity-60">
                      <LuCalendarDays size={32} className="mb-2" />
                      <p className="text-sm font-bold">No Classes</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[85vh]">
            {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* File Name Input */}
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

              {/* Select All / Deselect All Controls */}
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

              {/* Checkbox Grid */}
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

            {/* Modal Footer */}
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
