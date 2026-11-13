/**
 * Helpers for dynamic (admin-defined) form schemas.
 *
 * Staff and Student forms already ship with hard-coded sections/fields. The
 * Form Schema Builder seeds its editor with a small default schema for those
 * two modules (sec_1/sec_2, f_1...f_6). Those defaults must NOT be rendered a
 * second time, so we strip them and only show what the admin ADDED
 * (new sections, or new fields inside any section).
 */

const DEFAULT_FIELD_IDS = {
    staff: ['f_1', 'f_2', 'f_3', 'f_4', 'f_5', 'f_6'],
    students: ['f_1', 'f_2', 'f_3', 'f_4', 'f_5'],
};

const DEFAULT_FIELD_LABELS = {
    staff: ['first name', 'last name', 'email', 'phone', 'qualification', 'experience (years)'],
    students: ['first name', 'last name', 'date of birth', 'parent name', 'parent phone'],
};

const norm = (s) => String(s || '').trim().toLowerCase();

/** Normalizes any schema payload into an array of sections. */
export function normalizeSections(data) {
    if (!data) return [];
    if (Array.isArray(data.sections)) return data.sections;
    if (Array.isArray(data.fields) && data.fields.length > 0) {
        return [{ id: 'default', title: 'Custom Details', fields: data.fields }];
    }
    return [];
}

/** Removes built-in default fields and empty sections for core modules. */
export function stripDefaultFields(moduleKey, sections = []) {
    const ids = DEFAULT_FIELD_IDS[moduleKey];
    const labels = DEFAULT_FIELD_LABELS[moduleKey];
    return (sections || [])
        .map((sec) => ({
            ...sec,
            fields: (sec.fields || []).filter((f) => {
                if (!f || !f.id) return false;
                if (!ids) return true;
                // Default seeded field: same id AND same label (so renamed/new ones still show)
                const isSeeded = ids.includes(f.id) && labels.includes(norm(f.label));
                return !isSeeded;
            }),
        }))
        .filter((sec) => sec.fields.length > 0);
}

/** Returns a list of required-field labels that are empty. */
export function getMissingRequired(sections = [], customData = {}) {
    const missing = [];
    sections.forEach((sec) =>
        (sec.fields || []).forEach((f) => {
            if (!f.required) return;
            const v = customData?.[f.id];
            const empty =
                v === undefined || v === null || v === '' || (f.type === 'checkbox' && v !== true && v !== 'true');
            if (empty) missing.push(f.label);
        })
    );
    return missing;
}

/**
 * Where an admin-defined section is shown inside the hard-coded forms.
 * A section whose title matches one of the aliases below is rendered INSIDE
 * that existing tab/card (below the built-in fields). Sections that match
 * nothing are "unmatched" and get their own "Custom Details" tab/card.
 */
const SECTION_TARGETS = {
    staff: {
        'Personal': ['personal details', 'personal', 'personal info', 'personal information'],
        'Educational': ['academic details', 'academic', 'educational', 'educational details', 'education', 'education & work'],
        'Professional': ['professional', 'professional details', 'work details'],
        'Government & Identity': ['government & identity', 'government and identity', 'government details', 'identity', 'identity details', 'identity & banking'],
        'Employment': ['employment', 'employment details'],
        'Banking': ['banking', 'banking details', 'bank details'],
        'Uploads': ['uploads', 'upload', 'documents', 'document uploads'],
    },
    students: {
        'personal': ['student details', 'personal information', 'personal details', 'personal'],
        'contact': ['parent details', 'contact & family information', 'contact & family', 'contact details', 'family details', 'parent/guardian details'],
        'academic': ['academic information', 'academic details', 'academic'],
        'transport': ['transportation & other details', 'transportation', 'transport details', 'other details'],
        'fee': ['fee configuration', 'fee details', 'fees'],
        'address': ['address information', 'address details', 'address'],
    },
};

export const UNMATCHED = '__unmatched__';

/** Returns the built-in tab/card key a section title belongs to, or null. */
export function resolveTarget(moduleKey, title) {
    const map = SECTION_TARGETS[moduleKey];
    if (!map) return null;
    const t = norm(title);
    for (const [target, aliases] of Object.entries(map)) {
        if (aliases.includes(t)) return target;
    }
    return null;
}

/** Sections that belong to the given target keys (or UNMATCHED for the rest). */
export function sectionsForTargets(moduleKey, sections = [], targets = []) {
    const wantUnmatched = targets.includes(UNMATCHED);
    return (sections || []).filter((sec) => {
        if (targets.includes(`section:${sec.id}`)) return true;
        const tgt = resolveTarget(moduleKey, sec.title);
        return tgt === null ? wantUnmatched : targets.includes(tgt);
    });
}
