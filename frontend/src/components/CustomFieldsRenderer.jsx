import React, { useState } from 'react';
import useCustomSchema from '../hooks/useCustomSchema';
import { sectionsForTargets, UNMATCHED } from '../utils/customSchema';
import { LuPaperclip, LuEye } from 'react-icons/lu';
import FilePreviewModal from './FilePreviewModal';
import { toast } from 'react-hot-toast';

export default function CustomFieldsRenderer({ moduleKey, customData, onChange, readOnly = false, targets = null, variant = 'default' }) {
  // Sections come from the Form Schema Builder. For staff/students the built-in
  // default fields are stripped (they already exist in the hard-coded forms).
  const { sections: allSections, loading } = useCustomSchema(moduleKey);
  // `targets` (staff/students only): render just the sections that belong to the given
  // built-in tab/card(s), INSIDE that tab/card (no section heading). Use UNMATCHED for the rest.
  const sections = targets ? sectionsForTargets(moduleKey, allSections, targets) : allSections;
  const inline = Array.isArray(targets) && !targets.includes(UNMATCHED);
  const [previewUrl, setPreviewUrl] = useState(null);

  // 'compact' matches the hard-coded Staff/Student edit & view forms (small uppercase labels, text-sm inputs).
  const compact = variant === 'compact';
  const labelCls = compact
    ? `block text-xs font-bold ${readOnly ? 'text-slate-400 dark:text-slate-300' : 'text-slate-700 dark:text-slate-200'} uppercase tracking-wider mb-1`
    : 'block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1';
  const inputCls = compact
    ? 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 text-sm'
    : 'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900';
  const valueCls = compact ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-900 dark:text-white font-medium';

  if (loading) {
    if (inline) return null;
    return (
      <div className="flex justify-center p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (sections.length === 0) return null;

  return (
    <div className={inline ? "space-y-4 pt-2" : "space-y-8"}>
      {sections.map(section => {
        if (!section.fields || section.fields.length === 0) return null;

        return (
          <div key={section.id} className="space-y-4">
            {!inline && (
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                {section.title}
              </h4>
            )}
            <div className={compact || inline ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
              {section.fields.map(field => {
                const value = customData?.[field.id] || '';

                return (
                  <div key={field.id}>
                    <label className={labelCls}>
                      {field.label} {field.required && !readOnly && <span className="text-red-500">*</span>}
                    </label>

                    {readOnly ? (
                      <div className={valueCls}>
                        {field.type === 'checkbox' ? (value ? 'Yes' : 'No') : field.type === 'file' ? (
                          value ? (
                            <button
                              type="button"
                              onClick={() => setPreviewUrl(value)}
                              className="text-primary-600 hover:underline flex items-center gap-1"
                            >
                              <LuEye size={14} /> Preview & Download
                            </button>
                          ) : 'N/A'
                        ) : (value || 'N/A')}
                      </div>
                    ) : (
                      <>
                        {(field.type === 'text' || field.type === 'relation' || !['text', 'number', 'email', 'date', 'select', 'checkbox', 'file'].includes(field.type)) && (
                          <input
                            type="text"
                            required={field.required}
                            value={value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            className={inputCls}
                          />
                        )}

                        {field.type === 'number' && (
                          <input
                            type="number"
                            required={field.required}
                            value={value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            className={inputCls}
                          />
                        )}

                        {field.type === 'email' && (
                          <input
                            type="email"
                            required={field.required}
                            value={value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            className={inputCls}
                          />
                        )}

                        {field.type === 'date' && (
                          <input
                            type="date"
                            required={field.required}
                            value={value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            className={inputCls}
                          />
                        )}

                        {field.type === 'select' && (
                          <select
                            required={field.required}
                            value={value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            className={inputCls}
                          >
                            <option value="">Select...</option>
                            {(field.options || '').split(',').map((opt, idx) => (
                              <option key={idx} value={opt.trim()}>{opt.trim()}</option>
                            ))}
                          </select>
                        )}

                        {field.type === 'checkbox' && (
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              required={field.required}
                              checked={value === true || value === 'true'}
                              onChange={(e) => onChange(field.id, e.target.checked)}
                              className="w-4 h-4 text-primary-600 rounded border-slate-300 dark:border-slate-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-200">Yes</span>
                          </div>
                        )}

                        {field.type === 'file' && (
                          <div className="flex flex-col gap-2">
                            <input
                              type="file"
                              required={field.required && !value}
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  if (file.size > 3145728 && !file.type.startsWith('audio/')) {
                                    toast.error(`File "${file.name}" exceeds the 3MB limit.`);
                                    e.target.value = '';
                                    return;
                                  }
                                  onChange(field.id, file);
                                }
                              }}
                              className={inputCls}
                            />
                            {value instanceof File && (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <LuPaperclip /> Selected: {value.name}
                              </span>
                            )}
                            {!(value instanceof File) && value && typeof value === 'string' && (
                              <button
                                type="button"
                                onClick={() => setPreviewUrl(value)}
                                className="text-xs text-primary-600 flex items-center gap-1 hover:underline text-left"
                              >
                                <LuEye size={14} /> Preview Current File
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewUrl}
        fileUrl={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
