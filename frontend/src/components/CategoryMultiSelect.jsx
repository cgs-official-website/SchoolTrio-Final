import React from 'react';
import { LuTag as Tag, LuCheck as Check } from 'react-icons/lu';

/**
 * Optional multi-select for class categories.
 *  - "All categories" (nothing selected) = notice goes to the whole audience, every category.
 *  - Picking one or more categories narrows the notice to people connected to those categories.
 *
 * Props:
 *  categories: Array<{ id, name }>  - categories created in Admin > Classes > Manage Categories
 *  value:      string[]             - selected category ids ([] = all categories)
 *  onChange:   (ids: string[]) => void
 */
export default function CategoryMultiSelect({ categories = [], value = [], onChange, disabled = false }) {
    const allSelected = value.length === 0;

    const toggle = (id) => {
        if (disabled) return;
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    };

    const chip = (active) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${active
            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-400'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`;

    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Category <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(allSelected)} onClick={() => !disabled && onChange([])} aria-pressed={allSelected}>
                    {allSelected ? <Check size={13} /> : <Tag size={13} />} All categories
                </button>
                {categories.map((cat) => {
                    const active = value.includes(cat.id);
                    return (
                        <button key={cat.id} type="button" className={chip(active)} onClick={() => toggle(cat.id)} aria-pressed={active}>
                            {active ? <Check size={13} /> : <Tag size={13} />} {cat.name}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
                {allSelected
                    ? 'Sent to the whole selected audience, every category.'
                    : `Only people connected to ${value.length === 1 ? 'this category' : 'these categories'} will receive it.`}
                {categories.length === 0 && ' No categories yet - create them in Classes & Sections > Manage Categories.'}
            </p>
        </div>
    );
}
