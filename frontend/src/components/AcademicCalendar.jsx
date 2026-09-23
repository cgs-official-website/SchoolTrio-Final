import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '../context/AuthContext';
import { calendarApi } from '../api/calendar';
import toast from 'react-hot-toast';
import ConfirmModal from './ConfirmModal';
import { LuPlus as Plus, LuX as X, LuCalendarDays as CalendarIcon, LuTrash2 as Trash2 } from 'react-icons/lu';
import usePermissions from '../hooks/usePermissions';

import enUS from 'date-fns/locale/en-US';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/**
 * Safely parses YYYY-MM-DD string into a local Date without UTC offset shifting.
 *
 * @param {string|Date} dateStr
 * @returns {Date}
 */
const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
};

/**
 * Formats a local Date object or string into YYYY-MM-DD.
 *
 * @param {Date|string} date
 * @returns {string}
 */
const formatLocalDate = (date) => {
  if (!date) return '';
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function AcademicCalendar({ isAdmin }) {
  const { userProfile } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = isAdmin && (userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('calendar'));
  const hasEditPermission = isAdmin && (userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('calendar'));
  const hasDeletePermission = isAdmin && (userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('calendar'));

  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '', title: '' });
  const [newEvent, setNewEvent] = useState({ title: '', start: '', end: '', type: 'event', isCustomDates: false, customDates: [] });
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchEvents = useCallback(async () => {
    try {
      const res = await calendarApi.listEvents();
      const data = Array.isArray(res?.data) ? res.data : [];
      const formattedEvents = [];

      data.forEach(ev => {
        const startDate = parseLocalDate(ev.date || ev.start);
        const endDate = parseLocalDate(ev.endDate || ev.end || ev.date || ev.start);
        formattedEvents.push({
          ...ev,
          start: startDate,
          end: endDate
        });
      });

      // Inject Virtual Sundays for +/- 1 Year
      const eventDates = new Set(formattedEvents.map(e => e.start.toDateString()));
      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 1; y <= currentYear + 2; y++) {
        for (let m = 0; m < 12; m++) {
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(y, m, d);
            if (date.getDay() === 0 && !eventDates.has(date.toDateString())) {
              formattedEvents.push({
                id: `virtual-sunday-${y}-${m}-${d}`,
                title: 'Sunday (Holiday)',
                start: date,
                end: date,
                type: 'holiday',
                isVirtual: true,
                isCustomDates: false,
                customDates: []
              });
            }
          }
        }
      }

      setEvents(formattedEvents);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      toast.error("Failed to fetch calendar events.");
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    try {
      if (selectedEvent && !selectedEvent.isVirtual) {
        if (!hasEditPermission) {
          toast.error("You do not have permission to edit events.");
          return;
        }
        const startDateStr = newEvent.start;
        const endDateStr = newEvent.end || newEvent.start;
        if (!startDateStr) {
          toast.error("Please specify a valid start date");
          return;
        }
        if (endDateStr && endDateStr < startDateStr) {
          toast.error("End date cannot be earlier than start date");
          return;
        }
        const eventPayload = {
          title: newEvent.title.trim(),
          date: startDateStr,
          endDate: endDateStr,
          type: newEvent.type
        };
        await calendarApi.updateEvent(selectedEvent.id, eventPayload);
        toast.success("Event updated successfully!");
      } else {
        if (!hasCreatePermission) {
          toast.error("You do not have permission to create events.");
          return;
        }

        if (newEvent.isCustomDates) {
          if (!newEvent.customDates || newEvent.customDates.length === 0) {
            toast.error("Please add at least one custom date");
            return;
          }
          await Promise.all(
            newEvent.customDates.map(dateStr =>
              calendarApi.createEvent({
                title: newEvent.title.trim(),
                date: dateStr,
                endDate: dateStr,
                type: newEvent.type
              })
            )
          );
          toast.success("Events added to calendar!");
        } else {
          const startDateStr = newEvent.start;
          const endDateStr = newEvent.end || newEvent.start;
          if (!startDateStr) {
            toast.error("Please specify a valid start date");
            return;
          }
          if (endDateStr && endDateStr < startDateStr) {
            toast.error("End date cannot be earlier than start date");
            return;
          }
          const eventPayload = {
            title: newEvent.title.trim(),
            date: startDateStr,
            endDate: endDateStr,
            type: newEvent.type
          };
          await calendarApi.createEvent(eventPayload);
          toast.success("Event added to calendar!");
        }
      }
      
      setShowModal(false);
      setSelectedEvent(null);
      setNewEvent({ title: '', start: '', end: '', type: 'event', isCustomDates: false, customDates: [] });
      fetchEvents();
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error(error.message || "Failed to save event.");
    }
  };

  const handleDeleteEvent = () => {
    if (!selectedEvent || !isAdmin) return;
    if (selectedEvent.isVirtual) {
      toast.error("Cannot delete a default Sunday holiday. You can edit it instead.");
      return;
    }
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete events.");
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Delete Event",
      message: "Are you sure you want to delete this event?",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          await calendarApi.deleteEvent(selectedEvent.id);
          toast.success("Event deleted!");
          setShowModal(false);
          setSelectedEvent(null);
          setNewEvent({ title: '', start: '', end: '', type: 'event', isCustomDates: false, customDates: [] });
          fetchEvents();
        } catch (error) {
          console.error("Error deleting event:", error);
          toast.error(error.message || "Failed to delete event.");
        }
      }
    });
  };

  const handleSelectEvent = (event) => {
    if (!isAdmin) return;
    if (!hasEditPermission && !hasDeletePermission) return;
    setSelectedEvent(event);
    setNewEvent({
      title: event.title || '',
      start: event.date || (event.start ? formatLocalDate(event.start) : ''),
      end: event.endDate || (event.end ? formatLocalDate(event.end) : ''),
      type: event.type || 'event',
      isCustomDates: false,
      customDates: []
    });
    setShowModal(true);
  };

  const openNewEventModal = () => {
    if (!hasCreatePermission) {
      toast.error("You do not have permission to create events.");
      return;
    }
    setSelectedEvent(null);
    setNewEvent({ title: '', start: '', end: '', type: 'event', isCustomDates: false, customDates: [] });
    setShowModal(true);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 overflow-hidden flex flex-col h-[700px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarIcon className="text-primary-600" />
          Academic Calendar
        </h2>
        {isAdmin && hasCreatePermission && (
          <button 
            onClick={openNewEventModal}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> Add Event
          </button>
        )}
      </div>

      <div className="flex-1">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          onSelectEvent={handleSelectEvent}
          style={{ height: '100%' }}
          components={{
            toolbar: (toolbar) => {
              const goToBack = () => {
                const newDate = new Date(currentDate);
                newDate.setMonth(newDate.getMonth() - 1);
                setCurrentDate(newDate);
              };
              const goToNext = () => {
                const newDate = new Date(currentDate);
                newDate.setMonth(newDate.getMonth() + 1);
                setCurrentDate(newDate);
              };
              const goToCurrent = () => {
                setCurrentDate(new Date());
              };

              return (
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                  <div className="flex items-center gap-4">
                    <button onClick={goToBack} className="w-10 h-10 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-sm"><LuChevronLeft size={20} /></button>
                    <span className="text-2xl font-black text-slate-900 dark:text-white min-w-[180px] text-center">{toolbar.label}</span>
                    <button onClick={goToNext} className="w-10 h-10 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-sm"><LuChevronRight size={20} /></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2 mr-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary-500"></div> Event</span>
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Holiday</span>
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Exam</span>
                    </div>
                    <button onClick={goToCurrent} className="px-5 py-2.5 bg-primary-50 text-primary-700 font-bold rounded-xl hover:bg-primary-100 dark:hover:bg-slate-700 transition-colors">Today</button>
                  </div>
                </div>
              );
            }
          }}
          eventPropGetter={(event) => {
            let backgroundColor = '#c99bc1'; // primary
            if (event.type === 'holiday') backgroundColor = '#ef4444'; // red
            if (event.type === 'exam') backgroundColor = '#f59e0b'; // amber
            return { style: { backgroundColor, borderRadius: '8px', border: 'none', color: '#fff' } };
          }}
        />
      </div>

      {showModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedEvent ? 'Edit Event' : 'Add New Event'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddEvent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Event Title</label>
                <input 
                  type="text" required
                  value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div className="flex items-center gap-2 mt-4 mb-2">
                <input 
                  type="checkbox" 
                  id="customDatesToggle"
                  checked={newEvent.isCustomDates}
                  onChange={e => setNewEvent({...newEvent, isCustomDates: e.target.checked})}
                  className="w-4 h-4 text-primary-600 rounded border-slate-300 dark:border-slate-600 focus:ring-primary-500"
                />
                <label htmlFor="customDatesToggle" className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">Add multiple custom dates</label>
              </div>

              {!newEvent.isCustomDates ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Start Date</label>
                    <input 
                      type="date" required={!newEvent.isCustomDates}
                      value={newEvent.start} onChange={e => setNewEvent({...newEvent, start: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">End Date</label>
                    <input 
                      type="date" required={!newEvent.isCustomDates}
                      value={newEvent.end} onChange={e => setNewEvent({...newEvent, end: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Dates</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      id="customDateInput"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const dateInput = document.getElementById('customDateInput');
                        const dateVal = dateInput?.value;
                        if (dateVal && !newEvent.customDates.includes(dateVal)) {
                          setNewEvent({...newEvent, customDates: [...newEvent.customDates, dateVal].sort()});
                          if (dateInput) dateInput.value = '';
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shadow-sm border border-slate-200 dark:border-slate-700"
                    >
                      Add
                    </button>
                  </div>
                  {newEvent.customDates.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                      {newEvent.customDates.map((date, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold rounded-lg shadow-sm">
                          {parseLocalDate(date).toLocaleDateString('en-GB')}
                          <button 
                            type="button"
                            onClick={() => setNewEvent({...newEvent, customDates: newEvent.customDates.filter(d => d !== date)})}
                            className="p-0.5 hover:bg-indigo-200 rounded-full transition-colors text-indigo-500 hover:text-indigo-800"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Event Type</label>
                <select 
                  value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="event">General Event</option>
                  <option value="holiday">Holiday</option>
                  <option value="exam">Examination</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                {selectedEvent && (
                  <button 
                    type="button" onClick={handleDeleteEvent}
                    className="px-5 py-2.5 text-red-600 font-medium hover:bg-red-50 dark:hover:bg-slate-800 flex items-center gap-2 rounded-xl transition-colors mr-auto"
                  >
                    <Trash2 size={18} /> Delete
                  </button>
                )}
                <button 
                  type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl shadow-sm transition-colors"
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        message={confirmModal.message}
        title={confirmModal.title}
      />
    </div>
  );
}
