import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listClasses } from '../../api/classes';
import { listStaff } from '../../api/staff';
import { listSubjects } from '../../api/subjects';
import { listTimetables, getClassTimetable, replaceClassTimetable, getTimetableTemplate, saveTimetableTemplate } from '../../api/timetables';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../utils/liveData';
import { LuCalendar as Calendar, LuPlus as Plus, LuX as X, LuClock as Clock, LuBookOpen as BookOpen, LuUser as User, LuTrash2 as Trash2, LuPencil as Edit2, LuCircleAlert as AlertCircle, LuSettings as Settings, LuCoffee as Coffee, LuUtensils as Utensils } from 'react-icons/lu';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';
import CustomFieldsRenderer from '../../components/CustomFieldsRenderer';
import { uploadCustomDataFiles } from '../../utils/cloudinary';
import usePermissions from '../../hooks/usePermissions';
import { sortClassesAscending, formatClassSection, getSectionName, flattenClassesWithSections } from '../../utils/classSorting';

export const formatTime12hr = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  let hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${m} ${period}`;
};

export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

export const isEndTimeAfterStartTime = (start, end) => {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return false;
  return s < e;
};

export const areTimeIntervalsOverlapping = (startA, endA, startB, endB) => {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  if (sA === null || eA === null || sB === null || eB === null) return false;
  return sA < eB && eA > sB;
};

export const addMinutesToTime = (time24, mins) => {
  const t = timeToMinutes(time24);
  if (t === null) return '';
  const total = Math.min(t + mins, 23 * 60 + 55);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const TimePicker12Hour = ({ value, onChange, required }) => {
  let initialHour12 = '';
  let initialMinute = '';
  let initialPeriod = 'AM';

  if (value) {
    const [h, m] = value.split(':');
    const hour24 = parseInt(h, 10);
    initialPeriod = hour24 >= 12 ? 'PM' : 'AM';
    initialHour12 = (hour24 % 12 || 12).toString().padStart(2, '0');
    initialMinute = m;
  }

  const [hour, setHour] = useState(initialHour12);
  const [minute, setMinute] = useState(initialMinute);
  const [period, setPeriod] = useState(initialPeriod);

  const handleChange = (h, m, p) => {
    setHour(h);
    setMinute(m);
    setPeriod(p);

    if (h && m) {
      let h24 = parseInt(h, 10);
      if (p === 'PM' && h24 !== 12) h24 += 12;
      if (p === 'AM' && h24 === 12) h24 = 0;

      const time24 = `${h24.toString().padStart(2, '0')}:${m}`;
      onChange(time24);
    } else {
      onChange('');
    }
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  return (
    <div className="flex w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-primary-500 overflow-hidden divide-x divide-slate-200 dark:divide-slate-700">
      <select
        required={required}
        value={hour}
        onChange={(e) => handleChange(e.target.value, minute, period)}
        className="flex-1 px-3 py-2.5 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 appearance-none text-center cursor-pointer outline-none"
      >
        <option value="" disabled>HH</option>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        required={required}
        value={minute}
        onChange={(e) => handleChange(hour, e.target.value, period)}
        className="flex-1 px-3 py-2.5 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 appearance-none text-center cursor-pointer outline-none"
      >
        <option value="" disabled>MM</option>
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        value={period}
        onChange={(e) => handleChange(hour, minute, e.target.value)}
        className="flex-1 px-3 py-2.5 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 appearance-none text-center cursor-pointer font-bold outline-none"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

export const formatSectionLabel = (section) => {
  if (!section) return '';
  return getSectionName(section);
};

export const formatDisplayValue = (val, fallback = '') => {
  if (!val) return fallback;
  if (typeof val === 'object' && val !== null) {
    return val.name || val.code || fallback;
  }
  return String(val);
};

export const formatTeacherDisplay = (teacher, fallback = '') => {
  if (!teacher) return fallback;
  if (typeof teacher === 'object' && teacher !== null) {
    if (teacher.name) return teacher.name;
    const combined = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    return combined || fallback;
  }
  return String(teacher);
};

export function getEligibleTeachersForSubject(subNameOrId, currentClassId, teachersList = [], subjectsList = []) {
  if (!subNameOrId || !Array.isArray(teachersList) || teachersList.length === 0) return [];
  const subObj = (subjectsList || []).find(s => s.name === subNameOrId || s.id === subNameOrId);
  const subId = subObj?.id;
  const subName = subObj?.name || subNameOrId;

  // 1. Find all teachers assigned to this subject
  const subjectTeachers = teachersList.filter(t => {
    if (!t) return false;
    // Direct subject teacherId or assignedTeacherIds (if present on subject object)
    if (Array.isArray(subObj?.assignedTeacherIds) && subObj.assignedTeacherIds.includes(t.id)) {
      return true;
    }
    if (subObj?.teacherId === t.id) {
      return true;
    }

    // Teacher profile assigned subjects (from assignments or customData)
    const assignedSubIds = [
      ...(Array.isArray(t?.assignments?.assignedSubjectIds) ? t.assignments.assignedSubjectIds : []),
      ...(Array.isArray(t?.customData?.assignments?.assignedSubjectIds) ? t.customData.assignments.assignedSubjectIds : []),
      ...(Array.isArray(t?.assignedSubjectIds) ? t.assignedSubjectIds : []),
      ...(Array.isArray(t?.customData?.assignedSubjectIds) ? t.customData.assignedSubjectIds : [])
    ];

    return assignedSubIds.some(id =>
      id === subId ||
      id === subName ||
      (typeof id === 'string' && typeof subName === 'string' && id.trim().toLowerCase() === subName.trim().toLowerCase())
    );
  });

  if (subjectTeachers.length === 0) {
    return [];
  }

  // 2. If a class/section is specified, check if any subject teachers are specifically assigned to it.
  //    `currentClassId` may be one id or a list (e.g. [sectionId, classId]).
  const currentIds = (Array.isArray(currentClassId) ? currentClassId : [currentClassId]).filter(Boolean);
  if (currentIds.length > 0) {
    const classSpecificTeachers = subjectTeachers.filter(t => {
      const classIds = [
        t?.assignments?.assignedClassId,
        t?.customData?.assignments?.assignedClassId,
        t?.assignedClassId,
        ...(Array.isArray(t?.assignments?.subjectClassIds) ? t.assignments.subjectClassIds : []),
        ...(Array.isArray(t?.customData?.assignments?.subjectClassIds) ? t.customData.assignments.subjectClassIds : []),
        ...(Array.isArray(t?.subjectClassIds) ? t.subjectClassIds : []),
        ...(Array.isArray(t?.customData?.subjectClassIds) ? t.customData.subjectClassIds : [])
      ].filter(Boolean);

      return currentIds.some(id => classIds.includes(id));
    });

    if (classSpecificTeachers.length > 0) {
      return classSpecificTeachers;
    }
  }

  return subjectTeachers;
}

export default function TimetableManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('timetables');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('timetables');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('timetables');

  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  // A selectable "unit" is one class + ONE section (e.g. V - Section B). Every section has its own timetable.
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [usingSharedFallback, setUsingSharedFallback] = useState(false);

  const [schedule, setSchedule] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
  });
  const [customData, setCustomData] = useState({});
  const [template, setTemplate] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateDraft, setTemplateDraft] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [allTimetables, setAllTimetables] = useState({});
  const [masterDay, setMasterDay] = useState('Monday');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmModalState, setConfirmModalState] = useState({ isOpen: false, day: null, slotId: null });
  const [activeDay, setActiveDay] = useState('Monday');
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [newSlot, setNewSlot] = useState({
    startTime: '09:00',
    endTime: '10:00',
    subject: '',
    subjectId: '',
    teacher: '',
    teacherId: ''
  });

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const units = useMemo(() => flattenClassesWithSections(classes), [classes]);
  const selectedUnit = useMemo(() => units.find(u => u.id === selectedUnitId) || null, [units, selectedUnitId]);
  const selectedClassId = selectedUnit?.classId || '';
  const selectedSectionId = selectedUnit?.sectionId || null;

  // Timetable cached for the master view, keyed by "classId:sectionId" (or "classId:shared" for legacy periods)
  const timetableKey = (classId, sectionId) => `${classId}:${sectionId || 'shared'}`;
  const getUnitTimetable = (unit) =>
    allTimetables[timetableKey(unit.classId, unit.sectionId)] || allTimetables[timetableKey(unit.classId, null)] || null;

  // allTimetables keys look like "classId:sectionId". The class/section being edited must never be treated
  // as an "other class" when checking teacher clashes (otherwise its own periods show a false conflict).
  const isCurrentUnitKey = (key) =>
    key === timetableKey(selectedClassId, selectedSectionId) || key === timetableKey(selectedClassId, null);
  const classIdFromKey = (key) => String(key).split(':')[0];

  const unitLabelFromKey = (key) => {
    const [cId, sId] = String(key).split(':');
    if (sId && sId !== 'shared') {
      const unit = units.find(u => u.classId === cId && u.sectionId === sId);
      if (unit?.label) return unit.label;
    }
    // Legacy shared timetable (no section): fall back to the class label
    const cls = classes.find(c => c.id === cId);
    return cls ? formatClassSection(cls) : 'another class';
  };

  const fetchAllTimetables = useCallback(async () => {
    try {
      const res = await listTimetables();
      const periods = res.data || [];
      const timetablesMap = {};
      periods.forEach(p => {
        const mapKey = `${p.classId}:${p.sectionId || 'shared'}`;
        if (!timetablesMap[mapKey]) {
          timetablesMap[mapKey] = {
            Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
          };
        }
        const day = p.day || 'Monday';
        if (timetablesMap[mapKey][day]) {
          const subjectName = typeof p.subject === 'object' && p.subject !== null
            ? (p.subject.name || p.subject.code || 'Subject')
            : (p.subjectName || (typeof p.subject === 'string' ? p.subject : '') || 'Subject');
          const teacherName = typeof p.teacher === 'object' && p.teacher !== null
            ? (p.teacher.name || `${p.teacher.firstName || ''} ${p.teacher.lastName || ''}`.trim() || '')
            : (p.teacherName || (typeof p.teacher === 'string' ? p.teacher : '') || '');

          timetablesMap[mapKey][day].push({
            id: p.id,
            startTime: p.startTime,
            endTime: p.endTime,
            subject: subjectName,
            subjectId: p.subjectId || (typeof p.subject === 'object' && p.subject !== null ? p.subject.id : null),
            teacher: teacherName,
            teacherId: p.teacherId || (typeof p.teacher === 'object' && p.teacher !== null ? p.teacher.id : null),
            sectionId: p.sectionId,
            roomNumber: p.roomNumber
          });
        }
      });
      setAllTimetables(timetablesMap);
    } catch (err) {
      console.error("Error fetching all timetables:", err);
    }
  }, []);

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await getTimetableTemplate();
      setTemplate(res.data || null);
    } catch (err) {
      console.error('Error fetching timetable template:', err);
    }
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        const [classesRes, staffRes, subjectsRes] = await Promise.all([
          listClasses({ limit: 100 }),
          listStaff({ limit: 100 }),
          listSubjects({ limit: 100 })
        ]);
        if (!isMounted) return;

        const classesData = Array.isArray(classesRes?.data) ? classesRes.data : (Array.isArray(classesRes) ? classesRes : []);
        setClasses(sortClassesAscending(classesData));

        const staffData = Array.isArray(staffRes?.data) ? staffRes.data : (Array.isArray(staffRes) ? staffRes : []);
        setTeachers(staffData);

        const subjectsData = Array.isArray(subjectsRes?.data) ? subjectsRes.data : (Array.isArray(subjectsRes) ? subjectsRes : []);
        setSubjects(subjectsData);
      } catch (err) {
        console.error("Error loading timetable reference data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();
    fetchAllTimetables();
    fetchTemplate();

    return () => {
      isMounted = false;
    };
  }, [schoolId, fetchAllTimetables, fetchTemplate]);

  const fetchSeq = useRef(0);

  const fetchClassSchedule = useCallback((targetClassId, targetSectionId = null, showSpinner = true) => {
    const seq = ++fetchSeq.current;
    const emptyWeek = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };

    if (!targetClassId) {
      setSchedule(emptyWeek);
      setCustomData({});
      setUsingSharedFallback(false);
      return;
    }
    if (showSpinner) {
      // Drop the previous section's data right away so it is never shown under the new section
      setSchedule(emptyWeek);
      setCustomData({});
      setUsingSharedFallback(false);
      setLoading(true);
    }
    getClassTimetable(targetClassId, { sectionId: targetSectionId })
      .then((res) => {
        if (seq !== fetchSeq.current) return; // a newer request has started; ignore this one
        const fetchedPeriods = Array.isArray(res.data?.periods) ? res.data.periods : [];
        setUsingSharedFallback(Boolean(targetSectionId) && fetchedPeriods.length > 0 && fetchedPeriods.every(p => !p.sectionId));
        const scheduleData = res.data?.schedule || {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const normalizedSchedule = {};

        days.forEach(day => {
          normalizedSchedule[day] = (scheduleData[day] || []).map(slot => {
            const subDisplayName = typeof slot.subject === 'object' && slot.subject !== null
              ? (slot.subject.name || slot.subject.code || 'Subject')
              : (slot.subjectName || (typeof slot.subject === 'string' ? slot.subject : '') || 'Subject');
            const subId = slot.subjectId || (typeof slot.subject === 'object' && slot.subject !== null ? slot.subject.id : null);

            const teacherDisplayName = typeof slot.teacher === 'object' && slot.teacher !== null
              ? (slot.teacher.name || `${slot.teacher.firstName || ''} ${slot.teacher.lastName || ''}`.trim() || '')
              : (slot.teacherName || (typeof slot.teacher === 'string' ? slot.teacher : '') || '');
            const teacherId = slot.teacherId || (typeof slot.teacher === 'object' && slot.teacher !== null ? slot.teacher.id : null);

            return {
              ...slot,
              subject: subDisplayName,
              subjectId: subId,
              teacher: teacherDisplayName,
              teacherId: teacherId
            };
          });
        });

        setSchedule(normalizedSchedule);
        setCustomData(res.data?.customData || {});
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        console.error("Error fetching class timetable:", err);
        setSchedule({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
        setCustomData({});
        setUsingSharedFallback(false);
      })
      .finally(() => {
        if (showSpinner && seq === fetchSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchClassSchedule(selectedClassId, selectedSectionId, true);
  }, [selectedClassId, selectedSectionId, fetchClassSchedule]);

  // Live data synchronization for timetables
  const handleLiveRefresh = useCallback(() => {
    fetchAllTimetables();
    fetchTemplate();
    if (selectedClassId) {
      fetchClassSchedule(selectedClassId, selectedSectionId, false);
    }
  }, [fetchAllTimetables, fetchTemplate, fetchClassSchedule, selectedClassId, selectedSectionId]);

  useLiveDataRefresh(handleLiveRefresh, [handleLiveRefresh], ['timetables', 'timetable', 'subjects']);

  // Which template slot does this period belong to? Legacy periods are matched by identical times.
  const slotIdOf = (slot) => {
    if (slot?.templateSlotId) return slot.templateSlotId;
    return template?.slots?.find(
      s => s.slotType === 'PERIOD' && s.startTime === slot?.startTime && s.endTime === slot?.endTime
    )?.id || null;
  };

  const openAssignModal = (day, tSlot) => {
    setActiveDay(day);
    setEditingSlotId(null);
    setNewSlot({
      startTime: tSlot.startTime,
      endTime: tSlot.endTime,
      subject: '',
      subjectId: '',
      teacher: '',
      teacherId: '',
      templateSlotId: tSlot.id
    });
    setShowAddModal(true);
  };

  // ---- Period template editor ----
  const openTemplateModal = () => {
    if (selectedUnitId && !window.confirm('Unsaved changes in this section will be lost if you save the template. Continue?')) return;
    const base = (template?.slots || []).map(s => ({ ...s, key: s.id }));
    setTemplateDraft(
      base.length > 0
        ? base
        : [{ key: `n${Date.now()}`, slotType: 'PERIOD', label: 'Period 1', startTime: '09:00', endTime: '09:45' }]
    );
    setShowTemplateModal(true);
  };

  const addDraftSlot = (slotType) => {
    setTemplateDraft(prev => {
      const last = prev[prev.length - 1];
      const start = last ? last.endTime : '09:00';
      const duration = slotType === 'BREAK' ? 15 : 45;
      const periodCount = prev.filter(s => s.slotType === 'PERIOD').length;
      const label = slotType === 'PERIOD' ? `Period ${periodCount + 1}` : slotType === 'LUNCH' ? 'Lunch' : 'Break';
      return [...prev, { key: `n${Date.now()}${prev.length}`, slotType, label, startTime: start, endTime: addMinutesToTime(start, duration) }];
    });
  };

  const updateDraftSlot = (key, patch) =>
    setTemplateDraft(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));

  const removeDraftSlot = (key) => setTemplateDraft(prev => prev.filter(s => s.key !== key));

  const handleSaveTemplate = async () => {
    for (let i = 0; i < templateDraft.length; i++) {
      const s = templateDraft[i];
      if (!s.label.trim()) {
        toast.error('Every row needs a label.');
        return;
      }
      if (!isEndTimeAfterStartTime(s.startTime, s.endTime)) {
        toast.error(`"${s.label}": end time must be later than start time.`);
        return;
      }
      if (i > 0 && timeToMinutes(s.startTime) < timeToMinutes(templateDraft[i - 1].endTime)) {
        toast.error(`"${s.label}" starts before "${templateDraft[i - 1].label}" ends.`);
        return;
      }
    }
    if (!templateDraft.some(s => s.slotType === 'PERIOD')) {
      toast.error('Add at least one period.');
      return;
    }

    setSavingTemplate(true);
    try {
      const res = await saveTimetableTemplate({
        name: template?.name || 'Default Schedule',
        slots: templateDraft.map(s => ({
          id: s.id || undefined,
          slotType: s.slotType,
          label: s.label.trim(),
          startTime: s.startTime,
          endTime: s.endTime
        }))
      });
      setTemplate(res.data || null);
      setShowTemplateModal(false);
      toast.success('Period template saved');
      notifyDataChanged('timetables');
      notifyDataChanged('timetable');
      fetchAllTimetables();
      if (selectedClassId) fetchClassSchedule(selectedClassId, selectedSectionId, false);
    } catch (error) {
      toast.error(error.message || 'Failed to save template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAddSlot = (e) => {
    e.preventDefault();
    if (!newSlot.subject) return;
    if (!newSlot.teacherId) {
      toast.error('Please assign a teacher to this period.');
      return;
    }

    if (!newSlot.startTime || !newSlot.endTime) {
      toast.error("Please enter both start time and end time.");
      return;
    }

    if (!isEndTimeAfterStartTime(newSlot.startTime, newSlot.endTime)) {
      toast.error("End time must be later than start time.");
      return;
    }

    // 1. Conflict Detection: Overlapping periods within the same class on activeDay
    const currentDaySlots = schedule[activeDay] || [];
    const conflictingClassSlot = currentDaySlots.find(s =>
      s.id !== editingSlotId && areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
    );
    if (conflictingClassSlot) {
      const subName = formatDisplayValue(conflictingClassSlot.subject, 'Subject');
      toast.error(
        `Class schedule conflict: Overlaps with ${subName} (${formatTime12hr(conflictingClassSlot.startTime)} - ${formatTime12hr(conflictingClassSlot.endTime)}) on ${activeDay}. Periods within the same class cannot overlap.`
      );
      return;
    }

    // Resolve subjectId and teacherId from current subjects/teachers lists if not already explicitly set
    const subObj = subjects.find(s => s.name === newSlot.subject || s.id === newSlot.subject);
    const subId = newSlot.subjectId || subObj?.id || null;
    const teacherObj = teachers.find(t => t.id === newSlot.teacherId);
    const teacherDisplayName = newSlot.teacher || teacherObj?.name || (teacherObj?.firstName ? `${teacherObj.firstName} ${teacherObj.lastName || ''}`.trim() : '');
    const resolvedTeacherId = newSlot.teacherId || teacherObj?.id || null;

    // 2. Conflict Detection: Teacher schedule overlap across classes and within class
    if (resolvedTeacherId) {
      // 2a. Check overlapping periods for same teacher in current class
      const conflictingSameClassTeacherSlot = currentDaySlots.find(s =>
        s.id !== editingSlotId &&
        (s.teacherId === resolvedTeacherId || (s.teacher && s.teacher === teacherDisplayName)) &&
        areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
      );
      if (conflictingSameClassTeacherSlot) {
        toast.error(
          `Teacher conflict: ${teacherDisplayName || 'Teacher'} is already assigned to another period in this class from ${formatTime12hr(conflictingSameClassTeacherSlot.startTime)} to ${formatTime12hr(conflictingSameClassTeacherSlot.endTime)} on ${activeDay}.`
        );
        return;
      }

      // 2b. Check across all other classes in allTimetables
      for (const [classId, classGrid] of Object.entries(allTimetables)) {
        if (isCurrentUnitKey(classId)) continue;
        const otherSlots = classGrid?.[activeDay] || [];
        const conflictingOther = otherSlots.find(s =>
          (s.teacherId === resolvedTeacherId || (s.teacher && s.teacher === teacherDisplayName)) &&
          areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
        );
        if (conflictingOther) {
          const conflictingClassName = unitLabelFromKey(classId);
          toast.error(
            `Teacher conflict: ${teacherDisplayName || 'Teacher'} is already assigned to ${conflictingClassName} on ${activeDay} from ${formatTime12hr(conflictingOther.startTime)} to ${formatTime12hr(conflictingOther.endTime)}. A teacher cannot be assigned to two different classes in the same time slot.`
          );
          return;
        }
      }
    }

    const newSchedule = { ...schedule };

    const slotData = {
      ...newSlot,
      subjectId: subId,
      teacher: teacherDisplayName,
      teacherId: resolvedTeacherId
    };

    if (!newSchedule[activeDay]) {
      newSchedule[activeDay] = [];
    }

    if (editingSlotId) {
      newSchedule[activeDay] = newSchedule[activeDay].map(s =>
        s.id === editingSlotId ? { ...s, ...slotData } : s
      );
    } else {
      const slot = {
        id: Date.now().toString(),
        ...slotData
      };
      newSchedule[activeDay].push(slot);
    }

    // Sort slots by start time
    newSchedule[activeDay].sort((a, b) => a.startTime.localeCompare(b.startTime));

    setSchedule(newSchedule);
    setShowAddModal(false);
    setEditingSlotId(null);

    // Reset form but keep times (often admins add back-to-back periods)
    setNewSlot({
      startTime: newSlot.endTime, // auto-suggest next period start
      endTime: '',
      subject: '',
      subjectId: '',
      teacher: '',
      teacherId: ''
    });
  };

  const handleEditSlot = (day, slot) => {
    if (!hasEditPermission) return;
    setActiveDay(day);
    setEditingSlotId(slot.id);

    const subjectStr = typeof slot.subject === 'object' && slot.subject !== null
      ? (slot.subject.name || slot.subject.code || '')
      : (slot.subjectName || (typeof slot.subject === 'string' ? slot.subject : ''));
    const subjectId = slot.subjectId || (typeof slot.subject === 'object' && slot.subject !== null ? slot.subject.id : '');

    const teacherStr = typeof slot.teacher === 'object' && slot.teacher !== null
      ? (slot.teacher.name || `${slot.teacher.firstName || ''} ${slot.teacher.lastName || ''}`.trim() || '')
      : (slot.teacherName || (typeof slot.teacher === 'string' ? slot.teacher : ''));
    const teacherId = slot.teacherId || (typeof slot.teacher === 'object' && slot.teacher !== null ? slot.teacher.id : '');

    setNewSlot({
      startTime: slot.startTime,
      endTime: slot.endTime,
      subject: subjectStr,
      subjectId: subjectId,
      teacher: teacherStr,
      teacherId: teacherId,
      templateSlotId: slotIdOf(slot)
    });
    setShowAddModal(true);
  };

  const handleDeleteClick = (day, slotId) => {
    if (!hasDeletePermission) return;
    setConfirmModalState({ isOpen: true, day, slotId });
  };

  const executeDelete = () => {
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete periods.");
      return;
    }
    const { day, slotId } = confirmModalState;
    if (!day || !slotId) return;
    const newSchedule = { ...schedule };
    newSchedule[day] = (newSchedule[day] || []).filter(s => s.id !== slotId);
    setSchedule(newSchedule);
    setConfirmModalState({ isOpen: false, day: null, slotId: null });
  };

  // Helper to detect if a specific slot has a conflict
  const getSlotConflict = useCallback((day, slot) => {
    const daySlots = schedule[day] || [];
    // 1. Class overlap within same day
    const classConflict = daySlots.find(s => s.id !== slot.id && areTimeIntervalsOverlapping(slot.startTime, slot.endTime, s.startTime, s.endTime));
    if (classConflict) {
      return {
        type: 'class',
        message: `Overlaps with ${formatDisplayValue(classConflict.subject, 'another period')} (${formatTime12hr(classConflict.startTime)} - ${formatTime12hr(classConflict.endTime)})`
      };
    }
    // 2. Teacher conflict
    const slotTeacherId = slot.teacherId || (teachers.find(t => t.name === slot.teacher || t.id === slot.teacher)?.id);
    if (slotTeacherId) {
      // In same class
      const sameClassTeacherConflict = daySlots.find(s =>
        s.id !== slot.id &&
        (s.teacherId === slotTeacherId || (s.teacher && s.teacher === slot.teacher)) &&
        areTimeIntervalsOverlapping(slot.startTime, slot.endTime, s.startTime, s.endTime)
      );
      if (sameClassTeacherConflict) {
        return {
          type: 'teacher',
          message: `Teacher assigned to multiple periods at this time`
        };
      }
      // In other classes
      for (const [otherClassId, classGrid] of Object.entries(allTimetables)) {
        if (isCurrentUnitKey(otherClassId)) continue;
        const otherSlots = classGrid?.[day] || [];
        const tc = otherSlots.find(os => {
          const osTId = os.teacherId || (teachers.find(t => t.name === os.teacher || t.id === os.teacher)?.id);
          return (osTId === slotTeacherId || (os.teacher && os.teacher === slot.teacher)) &&
            areTimeIntervalsOverlapping(slot.startTime, slot.endTime, os.startTime, os.endTime);
        });
        if (tc) {
          const clsName = unitLabelFromKey(otherClassId);
          return {
            type: 'teacher',
            message: `Teacher assigned to ${clsName} (${formatTime12hr(tc.startTime)} - ${formatTime12hr(tc.endTime)})`
          };
        }
      }
    }
    return null;
  }, [schedule, allTimetables, selectedClassId, selectedSectionId, teachers, classes, units]);

  const handleSaveTimetable = async () => {
    if (!selectedClassId) return;
    if (!hasCreatePermission && !hasEditPermission) {
      toast.error("You do not have permission to modify timetables.");
      return;
    }

    // Pre-save validation: Check for any overlapping periods or teacher conflicts
    const dayKeys = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const day of dayKeys) {
      const daySlots = schedule[day] || [];
      // Check class overlap
      for (let i = 0; i < daySlots.length; i++) {
        for (let j = i + 1; j < daySlots.length; j++) {
          const s1 = daySlots[i];
          const s2 = daySlots[j];
          if (areTimeIntervalsOverlapping(s1.startTime, s1.endTime, s2.startTime, s2.endTime)) {
            toast.error(
              `Class schedule conflict: Overlapping periods detected on ${day} (${formatTime12hr(s1.startTime)}-${formatTime12hr(s1.endTime)} and ${formatTime12hr(s2.startTime)}-${formatTime12hr(s2.endTime)}). Periods within the same class cannot have overlapping time schedules.`
            );
            return;
          }
          const t1 = s1.teacherId || (teachers.find(t => t.name === s1.teacher || t.id === s1.teacher)?.id);
          const t2 = s2.teacherId || (teachers.find(t => t.name === s2.teacher || t.id === s2.teacher)?.id);
          if (t1 && t2 && t1 === t2 && areTimeIntervalsOverlapping(s1.startTime, s1.endTime, s2.startTime, s2.endTime)) {
            toast.error(
              `Teacher conflict: ${s1.teacher || 'Teacher'} is assigned to overlapping periods on ${day} (${formatTime12hr(s1.startTime)}-${formatTime12hr(s1.endTime)} and ${formatTime12hr(s2.startTime)}-${formatTime12hr(s2.endTime)}).`
            );
            return;
          }
        }
      }

      // Check teacher overlap against all other classes
      for (const slot of daySlots) {
        const slotTeacherId = slot.teacherId || (teachers.find(t => t.name === slot.teacher || t.id === slot.teacher)?.id);
        if (!slotTeacherId) continue;
        for (const [otherClassId, classGrid] of Object.entries(allTimetables)) {
          if (isCurrentUnitKey(otherClassId)) continue;
          const otherSlots = classGrid?.[day] || [];
          const conflicting = otherSlots.find(os => {
            const osTId = os.teacherId || (teachers.find(t => t.name === os.teacher || t.id === os.teacher)?.id);
            return (osTId === slotTeacherId || (os.teacher && os.teacher === slot.teacher)) &&
              areTimeIntervalsOverlapping(slot.startTime, slot.endTime, os.startTime, os.endTime);
          });
          if (conflicting) {
            const conflictingClassName = unitLabelFromKey(otherClassId);
            const teacherName = slot.teacher || 'Teacher';
            toast.error(
              `Teacher conflict: ${teacherName} is already assigned to ${conflictingClassName} on ${day} from ${formatTime12hr(conflicting.startTime)} to ${formatTime12hr(conflicting.endTime)}. A teacher cannot be assigned to two different classes in the same time slot.`
            );
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const uploadedCustomData = await uploadCustomDataFiles(customData, schoolId, 'timetables');

      // Every period must have a teacher before the timetable is saved
      const missingTeacher = [];
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach((day) => {
        (schedule[day] || []).forEach((slot) => {
          const tObj = typeof slot.teacher === 'object' && slot.teacher !== null ? slot.teacher : null;
          const hasTeacher = slot.teacherId || tObj?.id || (typeof slot.teacher === 'string' && teachers.some(t => t.name === slot.teacher));
          if (!hasTeacher) missingTeacher.push(day);
        });
      });
      if (missingTeacher.length > 0) {
        toast.error(`Assign a teacher to every period (missing on ${[...new Set(missingTeacher)].join(', ')}).`);
        return;
      }

      const payloadSchedule = {};
      const dayKeys = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const day of dayKeys) {
        payloadSchedule[day] = (schedule[day] || []).map((slot, idx) => {
          let subjectId = slot.subjectId;
          const subjectStr = typeof slot.subject === 'object' && slot.subject !== null
            ? (slot.subject.name || slot.subject.code || '')
            : (typeof slot.subject === 'string' ? slot.subject : '');

          if (!subjectId && subjectStr) {
            const foundSub = subjects.find(s => s.name === subjectStr || s.id === subjectStr);
            subjectId = foundSub?.id || null;
          }
          let teacherId = slot.teacherId || null;
          const teacherStr = typeof slot.teacher === 'object' && slot.teacher !== null
            ? (slot.teacher.name || '')
            : (typeof slot.teacher === 'string' ? slot.teacher : '');

          if (!teacherId && teacherStr) {
            const foundTeacher = teachers.find(t => t.name === teacherStr || t.id === teacherStr);
            teacherId = foundTeacher?.id || null;
          }
          return {
            id: slot.id,
            periodNumber: slot.periodNumber || idx + 1,
            startTime: slot.startTime,
            endTime: slot.endTime,
            templateSlotId: slotIdOf(slot),
            subjectId: subjectId || null,
            teacherId: teacherId || null,
            sectionId: selectedSectionId || slot.sectionId || null,
            roomNumber: slot.roomNumber || null
          };
        });
      }

      // sectionId => only THIS section's timetable is replaced; other sections are left untouched
      await replaceClassTimetable(selectedClassId, {
        sectionId: selectedSectionId,
        schedule: payloadSchedule,
        customData: uploadedCustomData
      });
      setUsingSharedFallback(false);
      toast.success(selectedUnit?.label ? `Timetable saved for ${selectedUnit.label}` : "Timetable saved successfully!");
      notifyDataChanged('timetables');
      notifyDataChanged('timetable');
      fetchAllTimetables();
    } catch (error) {
      console.error("Error saving timetable:", error);
      toast.error(error.message || "Failed to save timetable.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && classes.length === 0) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 shrink-0 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Timetable Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Structure the weekly schedule for each class section.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm w-full md:w-auto">
          <select
            value={selectedUnitId}
            onChange={(e) => {
              const value = e.target.value;
              setSchedule({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
              if (value) setLoading(true);
              setSelectedUnitId(value);
            }}
            className="px-4 py-2 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 font-medium w-full sm:w-64"
          >
            <option value="">Select a Class...</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>

          {hasEditPermission && (
            <button
              onClick={openTemplateModal}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center justify-center gap-2"
            >
              <Settings size={16} /> Period Template
            </button>
          )}

          {(hasCreatePermission || hasEditPermission) && (
            <button
              onClick={handleSaveTimetable}
              disabled={!selectedUnitId || saving}
              className="px-6 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {!selectedUnitId ? (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col min-h-0 overflow-hidden animate-fade-in-up">
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Master Timetable</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Overview of all classes for {masterDay}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto max-w-full pb-2 sm:pb-0 custom-scrollbar">
              {daysOfWeek.map(day => (
                <button
                  key={day}
                  onClick={() => setMasterDay(day)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${masterDay === day
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300'
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar space-y-6">
            {units.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-300">
                <Calendar size={48} className="mb-4 text-slate-200" />
                <p className="font-bold">No classes available.</p>
              </div>
            ) : (
              units.map(cls => {
                const classSchedule = getUnitTimetable(cls)?.[masterDay] || [];
                return (
                  <div key={cls.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 hover:border-primary-200 dark:hover:border-slate-700 transition-colors">
                    <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                        {cls.label}
                      </h3>
                      <button
                        onClick={() => {
                          setSchedule({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
                          setLoading(true);
                          setSelectedUnitId(cls.id);
                        }}
                        className="text-xs font-bold text-primary-600 hover:text-white bg-primary-50 hover:bg-primary-600 px-3 py-1.5 rounded-lg transition-colors border border-primary-100 hover:border-primary-600 dark:hover:border-slate-700 shadow-sm"
                      >
                        Edit Timetable
                      </button>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-900 flex gap-4 overflow-x-auto custom-scrollbar">
                      {classSchedule.length === 0 ? (
                        <div className="w-full text-center py-6">
                          <p className="text-sm font-semibold text-slate-400 dark:text-slate-300">No periods scheduled for {masterDay}.</p>
                        </div>
                      ) : (
                        classSchedule.map(slot => (
                          <div key={slot.id} className="shrink-0 w-52 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:border-primary-200 dark:hover:border-slate-700 hover:shadow-md transition-all group">
                            <div className="text-xs font-bold text-primary-600 mb-2 flex items-center gap-1.5">
                              <Clock size={12} />
                              {formatTime12hr(slot.startTime)} - {formatTime12hr(slot.endTime)}
                            </div>
                            <div className="mt-2 space-y-1.5 min-w-0">
                              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 leading-tight truncate" title={formatDisplayValue(slot.subject, 'Subject')}>
                                <BookOpen size={14} className="text-primary-500 shrink-0" />
                                <span className="truncate">{formatDisplayValue(slot.subject, 'Subject')}</span>
                              </div>
                              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 truncate bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md" title={formatTeacherDisplay(slot.teacher, 'Not Assigned')}>
                                <User size={12} className="text-slate-400 shrink-0" />
                                {formatTeacherDisplay(slot.teacher, 'Not Assigned')}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
          <div className="relative flex-1 bg-slate-100 dark:bg-slate-700 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden flex flex-col min-h-0">
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/80 dark:bg-slate-700/80 backdrop-blur-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
              </div>
            )}
            {usingSharedFallback && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold shrink-0">
                {selectedUnit?.label} is showing the old shared class timetable. Adjust it for this section and click Save Changes to give {selectedUnit?.label} its own timetable.
              </div>
            )}

          {template ? (
            <>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <div className="min-w-[980px]">
                  {/* Day header */}
                  <div
                    className="grid bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10"
                    style={{ gridTemplateColumns: '150px repeat(6, minmax(0, 1fr))' }}
                  >
                    <div className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-300">Period</div>
                    {daysOfWeek.map(day => (
                      <div key={day} className="p-4 text-center font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-sm border-l border-slate-200 dark:border-slate-700">
                        {day}
                      </div>
                    ))}
                  </div>

                  {template.slots.map(tSlot => {
                    // Break / Lunch: locked band
                    if (tSlot.slotType !== 'PERIOD') {
                      return (
                        <div key={tSlot.id} className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs font-bold">
                          {tSlot.slotType === 'LUNCH' ? <Utensils size={14} /> : <Coffee size={14} />}
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
                            <Clock size={12} />
                            {formatTime12hr(tSlot.startTime)} - {formatTime12hr(tSlot.endTime)}
                          </div>
                        </div>

                        {daysOfWeek.map(day => {
                          const slot = (schedule[day] || []).find(s => slotIdOf(s) === tSlot.id);
                          const conflictInfo = slot ? getSlotConflict(day, slot) : null;

                          return (
                            <div key={day} className="p-2 border-l border-slate-200 dark:border-slate-700 min-h-[96px]">
                              {slot ? (
                                <div className={`bg-white dark:bg-slate-900 rounded-2xl border ${conflictInfo ? 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-300/50 dark:ring-rose-800/50' : 'border-slate-200 dark:border-slate-700'} p-3 shadow-sm hover:shadow-md transition-shadow group relative h-full`}>
                                  <div className="font-bold text-slate-900 dark:text-white mb-2 flex items-start gap-1.5 leading-tight pr-12">
                                    <BookOpen size={14} className="text-primary-500 shrink-0 mt-0.5" />
                                    {formatDisplayValue(slot.subject, 'Subject')}
                                  </div>
                                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg inline-flex items-center gap-1.5 border border-slate-100 dark:border-slate-800 max-w-full">
                                    <User size={12} className="text-slate-400 dark:text-slate-300 shrink-0" />
                                    <span className="truncate">{formatTeacherDisplay(slot.teacher, 'Not Assigned')}</span>
                                  </div>

                                  {conflictInfo && (
                                    <div
                                      className="text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg px-2 py-1 flex items-center gap-1.5 mt-2"
                                      title={conflictInfo.message}
                                    >
                                      <AlertCircle size={13} className="text-rose-500 shrink-0" />
                                      <span className="truncate">{conflictInfo.message}</span>
                                    </div>
                                  )}

                                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    {hasEditPermission && (
                                      <button
                                        onClick={() => handleEditSlot(day, slot)}
                                        className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg"
                                        title="Edit Period"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                    )}
                                    {hasDeletePermission && (
                                      <button
                                        onClick={() => handleDeleteClick(day, slot.id)}
                                        className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg"
                                        title="Delete Period"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : hasCreatePermission ? (
                                <button
                                  onClick={() => openAssignModal(day, tSlot)}
                                  className="w-full h-full min-h-[80px] flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-300 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Plus size={14} /> Assign
                                </button>
                              ) : (
                                <div className="h-full min-h-[80px] flex items-center justify-center text-xs text-slate-400 dark:text-slate-300">Free</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Old periods whose times match no template slot */}
                  {(() => {
                    const unmatched = daysOfWeek.flatMap(day =>
                      (schedule[day] || []).filter(s => !slotIdOf(s)).map(s => ({ day, slot: s }))
                    );
                    if (unmatched.length === 0) return null;
                    return (
                      <div className="m-4 p-4 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                          <AlertCircle size={16} /> Periods with old timings
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 mb-3">
                          These periods don't match any slot in the template. They keep their own timings until you delete them and assign the subject in a template slot.
                        </p>
                        <div className="space-y-2">
                          {unmatched.map(({ day, slot }) => (
                            <div key={slot.id} className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              <span className="truncate">
                                {day} · {formatTime12hr(slot.startTime)} - {formatTime12hr(slot.endTime)} · {formatDisplayValue(slot.subject, 'Subject')} · {formatTeacherDisplay(slot.teacher, 'Not Assigned')}
                              </span>
                              {hasDeletePermission && (
                                <button
                                  onClick={() => handleDeleteClick(day, slot.id)}
                                  className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg shrink-0"
                                  title="Delete Period"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold shrink-0 flex flex-wrap items-center gap-2">
                No period template yet.
                {hasEditPermission && (
                  <button onClick={openTemplateModal} className="underline font-bold">Set up periods, breaks and lunch once</button>
                )}
              </div>

              {/* Grid Header (Days) */}
              <div className="grid grid-cols-1 md:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shrink-0">
                {daysOfWeek.map(day => (
                  <div key={day} className="p-4 text-center font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-sm flex justify-between items-center md:block">
                    <span>{day}</span>
                    {hasCreatePermission && (
                      <button
                        onClick={() => {
                          setActiveDay(day);
                          setEditingSlotId(null);
                          setNewSlot({
                            startTime: '09:00',
                            endTime: '10:00',
                            subject: '',
                            subjectId: '',
                            teacher: '',
                            teacherId: ''
                          });
                          setShowAddModal(true);
                        }}
                        className="md:mt-2 text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 dark:hover:bg-slate-700 p-1.5 md:mx-auto rounded-lg transition-colors flex items-center justify-center"
                        title={`Add slot to ${day}`}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Grid Columns (Slots) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-0">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-0 md:divide-x divide-slate-200 min-h-full">
                    {daysOfWeek.map(day => (
                      <div key={day} className="bg-slate-50/50 dark:bg-slate-800/50 p-2 space-y-3 md:min-h-[500px]">
                        {/* Mobile Day Header (only visible on small screens) */}
                        <h3 className="font-bold text-slate-700 dark:text-slate-200 md:hidden mb-2 px-2">{day}</h3>

                        {(!schedule[day] || schedule[day].length === 0) ? (
                          <div className="text-center p-4 text-sm text-slate-400 dark:text-slate-300 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl mx-2">
                            Free Day
                          </div>
                        ) : (
                          (schedule[day] || []).map(slot => {
                            const conflictInfo = getSlotConflict(day, slot);
                            return (
                              <div key={slot.id} className={`bg-white dark:bg-slate-900 rounded-2xl border ${conflictInfo ? 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-300/50 dark:ring-rose-800/50' : 'border-slate-200 dark:border-slate-700'} p-3 shadow-sm hover:shadow-md transition-shadow group relative`}>

                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                                  <Clock size={12} className="text-primary-500" />
                                  {formatTime12hr(slot.startTime)} - {formatTime12hr(slot.endTime)}
                                </div>

                                <div className="font-bold text-slate-900 dark:text-white mb-2 flex items-start gap-1.5 leading-tight">
                                  <BookOpen size={14} className="text-primary-500 shrink-0 mt-0.5" />
                                  {formatDisplayValue(slot.subject, 'Subject')}
                                </div>

                                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg inline-flex items-center gap-1.5 border border-slate-100 dark:border-slate-800">
                                  <User size={12} className="text-slate-400 dark:text-slate-300" />
                                  {formatTeacherDisplay(slot.teacher, 'Not Assigned')}
                                </div>

                                {conflictInfo && (
                                  <div
                                    className="text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg px-2 py-1 flex items-center gap-1.5 mt-2 shadow-xs"
                                    title={conflictInfo.message}
                                  >
                                    <AlertCircle size={13} className="text-rose-500 shrink-0" />
                                    <span className="truncate">{conflictInfo.message}</span>
                                  </div>
                                )}

                                {/* Edit and Delete Buttons (visible on hover) */}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  {hasEditPermission && (
                                    <button
                                      onClick={() => handleEditSlot(day, slot)}
                                      className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg"
                                      title="Edit Period"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  )}
                                  {hasDeletePermission && (
                                    <button
                                      onClick={() => handleDeleteClick(day, slot.id)}
                                      className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg"
                                      title="Delete Period"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ))}
                  </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Slot Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {editingSlotId ? <Edit2 className="text-primary-600" /> : <Plus className="text-primary-600" />}
                {editingSlotId ? `Edit Period in ${activeDay}` : `Add Period to ${activeDay}`}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSlot} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                {newSlot.templateSlotId ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Clock size={16} className="text-primary-500" />
                    {formatTime12hr(newSlot.startTime)} - {formatTime12hr(newSlot.endTime)}
                    <span className="ml-auto text-xs font-medium text-slate-400 dark:text-slate-300">Set by period template</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Start Time</label>
                      <TimePicker12Hour
                        required
                        value={newSlot.startTime}
                        onChange={(val) => setNewSlot({ ...newSlot, startTime: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">End Time</label>
                      <TimePicker12Hour
                        required
                        value={newSlot.endTime}
                        onChange={(val) => setNewSlot({ ...newSlot, endTime: val })}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subject</label>
                    <select
                      required
                      value={newSlot.subject}
                      onChange={(e) => {
                        const subName = e.target.value;
                        const subObj = subjects.find(s => s.name === subName || s.id === subName);
                        const subId = subObj?.id || '';

                        if (!subName) {
                          setNewSlot(prev => ({
                            ...prev,
                            subject: '',
                            subjectId: '',
                            teacher: '',
                            teacherId: ''
                          }));
                          return;
                        }

                        const eligible = getEligibleTeachersForSubject(subName, [selectedSectionId, selectedClassId], teachers, subjects);

                        // Auto-select assigned teacher: if current selected teacher is already eligible, keep it; otherwise select the first eligible teacher
                        let chosenTeacherId = '';
                        let chosenTeacherName = '';

                        if (eligible.length > 0) {
                          const matchingCurrent = eligible.find(t => t.id === newSlot.teacherId);
                          const defaultTeacher = matchingCurrent || eligible[0];
                          chosenTeacherId = defaultTeacher.id;
                          chosenTeacherName = defaultTeacher.name || `${defaultTeacher.firstName || ''} ${defaultTeacher.lastName || ''}`.trim() || 'Unnamed Teacher';
                        }

                        setNewSlot(prev => ({
                          ...prev,
                          subject: subObj?.name || subName,
                          subjectId: subId,
                          teacherId: chosenTeacherId,
                          teacher: chosenTeacherName
                        }));
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    >
                      <option value="">Select Subject...</option>
                      {subjects.map(sub => (
                        <option key={sub.id} value={sub.name}>{sub.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Teacher <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={newSlot.teacherId}
                      onChange={(e) => {
                        const teacher = teachers.find(t => t.id === e.target.value);
                        if (teacher) {
                          const displayName = teacher.name || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Unnamed Teacher';
                          setNewSlot(prev => ({ ...prev, teacherId: teacher.id, teacher: displayName }));
                        } else {
                          setNewSlot(prev => ({ ...prev, teacherId: '', teacher: '' }));
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    >
                      {!newSlot.subject ? (
                        <option value="">-- Select Subject First --</option>
                      ) : (
                        <>
                          <option value="">-- Select Teacher --</option>
                          {(() => {
                            const eligible = getEligibleTeachersForSubject(newSlot.subject, [selectedSectionId, selectedClassId], teachers, subjects);
                            const eligibleIds = new Set(eligible.map(t => t.id));
                            const otherTeachers = teachers.filter(t => !eligibleIds.has(t.id));

                            if (eligible.length > 0) {
                              return (
                                <>
                                  <optgroup label="Assigned Teachers">
                                    {eligible.map(t => {
                                      const displayName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unnamed Teacher';
                                      return (
                                        <option key={t.id} value={t.id}>{displayName}</option>
                                      );
                                    })}
                                  </optgroup>
                                  {otherTeachers.length > 0 && (
                                    <optgroup label="Other Teachers">
                                      {otherTeachers.map(t => {
                                        const displayName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unnamed Teacher';
                                        return (
                                          <option key={t.id} value={t.id}>{displayName}</option>
                                        );
                                      })}
                                    </optgroup>
                                  )}
                                </>
                              );
                            }

                            return teachers.map(t => {
                              const displayName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unnamed Teacher';
                              return (
                                <option key={t.id} value={t.id}>{displayName}</option>
                              );
                            });
                          })()}
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl shadow-sm transition-colors"
                >
                  {editingSlotId ? 'Update Period' : 'Add Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Period Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings className="text-primary-600" /> Period Template
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Set periods, breaks and lunch once. Every section uses these timings.
                </p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
              {templateDraft.map((s, idx) => (
                <div
                  key={s.key}
                  className={`rounded-2xl border p-3 grid grid-cols-1 md:grid-cols-[110px_1fr_1fr_1fr_auto] gap-3 items-center ${s.slotType === 'PERIOD'
                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30'
                    }`}
                >
                  <select
                    value={s.slotType}
                    onChange={(e) => updateDraftSlot(s.key, { slotType: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm font-semibold"
                  >
                    <option value="PERIOD">Period</option>
                    <option value="BREAK">Break</option>
                    <option value="LUNCH">Lunch</option>
                  </select>
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => updateDraftSlot(s.key, { label: e.target.value })}
                    placeholder="Label"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm"
                  />
                  <TimePicker12Hour value={s.startTime} onChange={(val) => updateDraftSlot(s.key, { startTime: val })} />
                  <TimePicker12Hour value={s.endTime} onChange={(val) => updateDraftSlot(s.key, { endTime: val })} />
                  <button
                    onClick={() => removeDraftSlot(s.key)}
                    className="p-2 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg justify-self-end"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => addDraftSlot('PERIOD')} className="px-4 py-2 text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5">
                  <Plus size={14} /> Add Period
                </button>
                <button onClick={() => addDraftSlot('BREAK')} className="px-4 py-2 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-950/30 rounded-xl transition-colors flex items-center gap-1.5">
                  <Coffee size={14} /> Add Break
                </button>
                <button onClick={() => addDraftSlot('LUNCH')} className="px-4 py-2 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-950/30 rounded-xl transition-colors flex items-center gap-1.5">
                  <Utensils size={14} /> Add Lunch
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 disabled:opacity-50 rounded-xl shadow-sm transition-colors"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ isOpen: false, day: null, slotId: null })}
        onConfirm={executeDelete}
        title="Delete Timetable Slot"
        message="Are you sure you want to delete this class period? This action cannot be undone."
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
}