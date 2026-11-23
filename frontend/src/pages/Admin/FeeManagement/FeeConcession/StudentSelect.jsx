import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { LuX as X } from 'react-icons/lu';
import { studentsApi } from '../../../../api/students';
import { inputClass, useDebouncedValue } from '../FeeMaster/components';

const toOption = (s) => {
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student';
  const extra = [s.admissionNumber, s.class?.name || s.className].filter(Boolean).join(' • ');
  return { value: s.id, label: extra ? `${name} (${extra})` : name };
};

export default function StudentSelect({ value, onChange, classId = '', sectionId = '', disabled = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 350);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    studentsApi
      .listStudents({
        search: debounced.trim(),
        classId: classId || undefined,
        sectionId: sectionId || undefined,
        limit: 50
      })
      .then((res) => {
        if (requestId !== requestRef.current) return;
        setOptions((res?.data || []).map(toOption));
      })
      .catch((error) => {
        if (requestId !== requestRef.current) return;
        setOptions([]);
        toast.error(error.message || 'Failed to load students.');
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [debounced, open, classId, sectionId]);

  if (value) {
    return (
      <div className={`${inputClass} flex items-center justify-between gap-2`}>
        <span className="truncate">{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear student"
          className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={disabled ? 'Select a class first' : 'Search Student Name or Admission No.'}
        className={`${inputClass} disabled:opacity-60`}
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Loading...' : 'No students found.'}
            </li>
          ) : (
            options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}