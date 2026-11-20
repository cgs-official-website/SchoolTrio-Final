import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { LuX as X } from 'react-icons/lu';
import { studentsApi } from '../../../../api/students';
import { inputClass, useDebouncedValue } from '../FeeMaster/components';

const MAX_CHIPS = 12;
const STUDENT_PAGE_SIZE = 20;

const smallBtn =
  'px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0';

/**
 * Searchable multi-select checklist.
 *
 * options:  [{ value, label }]
 * selected: [{ value, label }]  (labels are kept so chips survive a new search)
 * Pass onQueryChange for server-side search; otherwise options are filtered here.
 */
function MultiPicker({ options, selected, onChange, onQueryChange, loading = false, placeholder, emptyText, footer }) {
  const [query, setQuery] = useState('');
  const selectedValues = useMemo(() => new Set(selected.map((s) => s.value)), [selected]);

  const visible = useMemo(() => {
    if (onQueryChange) return options;
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query, onQueryChange]);

  const allShownSelected = visible.length > 0 && visible.every((o) => selectedValues.has(o.value));

  const handleQuery = (value) => {
    setQuery(value);
    if (onQueryChange) onQueryChange(value);
  };

  const toggle = (opt) => {
    if (selectedValues.has(opt.value)) {
      onChange(selected.filter((s) => s.value !== opt.value));
    } else {
      onChange([...selected, { value: opt.value, label: opt.label }]);
    }
  };

  const toggleAllShown = () => {
    if (allShownSelected) {
      const shown = new Set(visible.map((o) => o.value));
      onChange(selected.filter((s) => !shown.has(s.value)));
    } else {
      const extra = visible
        .filter((o) => !selectedValues.has(o.value))
        .map((o) => ({ value: o.value, label: o.label }));
      onChange([...selected, ...extra]);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {selected.length > 0 && (
        <div className="p-3 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          {selected.slice(0, MAX_CHIPS).map((item) => (
            <span
              key={item.value}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-lg text-xs font-bold bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800"
            >
              {item.label}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s.value !== item.value))}
                aria-label={`Remove ${item.label}`}
                className="p-0.5 rounded hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {selected.length > MAX_CHIPS && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 self-center">
              +{selected.length - MAX_CHIPS} more
            </span>
          )}
        </div>
      )}

      <div className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
        <button type="button" className={smallBtn} onClick={toggleAllShown} disabled={visible.length === 0}>
          {allShownSelected ? 'Clear shown' : 'Select all shown'}
        </button>
        {selected.length > 0 && (
          <button type="button" className={smallBtn} onClick={() => onChange([])}>
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Loading...' : emptyText}
          </p>
        ) : (
          <ul className={`divide-y divide-slate-100 dark:divide-slate-800 ${loading ? 'opacity-60' : ''}`}>
            {visible.map((opt) => (
              <li key={opt.value}>
                <label className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={selectedValues.has(opt.value)}
                    onChange={() => toggle(opt)}
                    className="accent-primary-600 w-4 h-4"
                  />
                  <span>{opt.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {footer && (
        <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
          {footer}
        </p>
      )}
    </div>
  );
}

const toStudentOption = (s) => {
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student';
  const extra = [s.admissionNumber, s.class?.name || s.className].filter(Boolean).join(' • ');
  return { value: s.id, label: extra ? `${name} (${extra})` : name };
};

function StudentPicker({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const debounced = useDebouncedValue(query, 350);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    studentsApi
      .listStudents({ search: debounced.trim(), limit: STUDENT_PAGE_SIZE })
      .then((res) => {
        if (requestId !== requestRef.current) return;
        setOptions((res?.data || []).map(toStudentOption));
      })
      .catch((error) => {
        if (requestId !== requestRef.current) return;
        setOptions([]);
        toast.error(error.message || 'Failed to load students.');
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [debounced]);

  return (
    <MultiPicker
      options={options}
      selected={selected}
      onChange={onChange}
      onQueryChange={setQuery}
      loading={loading}
      placeholder="Search by student name or admission number"
      emptyText="No students found."
      footer={`Showing up to ${STUDENT_PAGE_SIZE} students. Type to find others; your selections are kept.`}
    />
  );
}

/**
 * Shows the right picker for the chosen Fee Type Name.
 * Renders nothing for All Student.
 */
export default function FeeEntryTargetPicker({ feeType, selected, onChange, classOptions, sectionOptions }) {
  if (feeType === 'CLASS') {
    return (
      <MultiPicker
        options={classOptions}
        selected={selected}
        onChange={onChange}
        placeholder="Search classes"
        emptyText="No classes found."
      />
    );
  }

  if (feeType === 'SECTION') {
    return (
      <MultiPicker
        options={sectionOptions}
        selected={selected}
        onChange={onChange}
        placeholder="Search class sections"
        emptyText="No class sections found."
      />
    );
  }

  if (feeType === 'STUDENT') {
    return <StudentPicker selected={selected} onChange={onChange} />;
  }

  return null;
}