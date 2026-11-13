import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFormSchema } from '../api/customModules';
import { normalizeSections, stripDefaultFields, sectionsForTargets, UNMATCHED } from '../utils/customSchema';
import { useLiveDataRefresh } from './useLiveDataRefresh';

/**
 * Loads the admin-defined form schema for a module and keeps it in sync
 * when the admin saves the Form Builder ('forms' live-refresh channel).
 * Built-in default fields of staff/students are removed (they already exist
 * in the hard-coded forms), so `sections` only holds what the admin added.
 */
export default function useCustomSchema(moduleKey) {
    const { userProfile } = useAuth();
    const schoolId = userProfile?.schoolId;
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!schoolId || !moduleKey) return;
        try {
            const res = await getFormSchema(moduleKey);
            const data = res?.data || res;
            setSections(stripDefaultFields(moduleKey, normalizeSections(data)));
        } catch (err) {
            console.error(`Error loading custom schema for ${moduleKey}:`, err);
            setSections([]);
        } finally {
            setLoading(false);
        }
    }, [schoolId, moduleKey]);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'forms');

    // Sections that don't belong to any existing tab/card get their own "Custom Details" tab/card
    const unmatchedSections = sectionsForTargets(moduleKey, sections, [UNMATCHED]);

    return {
        sections,
        unmatchedSections,
        loading,
        hasCustomFields: sections.length > 0,
        hasUnmatched: unmatchedSections.length > 0,
        reload: load
    };
}
