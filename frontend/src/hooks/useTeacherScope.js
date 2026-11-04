import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { listMyClasses } from '../api/classes';
import { flattenClassesWithSections } from '../utils/classSorting';

/**
 * Resolves the class + SECTION a teacher works with.
 *
 * Asks the backend for only the sections the teacher is CLASS TEACHER of
 * (GET /classes/my-classes?classTeacherOnly=true) so that the class teacher of V-B
 * never sees V-A students, and every teacher page (Class Dashboard, Attendance,
 * Grades & Exams, Performance...) uses the same class/section.
 *
 * @returns {{
 *   loading: boolean,
 *   units: Array,          // selectable class-section units (usually exactly one)
 *   unit: Object|null,     // currently selected unit
 *   classId: string|null,
 *   sectionId: string|null,
 *   label: string,         // e.g. "V - Section B"
 *   setUnitKey: (key: string) => void
 * }}
 */
export function useTeacherScope() {
    const { userProfile } = useAuth();
    const schoolId = userProfile?.schoolId;
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedKey, setSelectedKey] = useState(null);

    useEffect(() => {
        if (!schoolId) return undefined;
        let active = true;
        setLoading(true);
        listMyClasses({ classTeacherOnly: true })
            .then((res) => {
                if (!active) return;
                setClasses(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
            })
            .catch((err) => {
                console.error('[useTeacherScope] Failed to load assigned classes:', err);
                if (active) setClasses([]);
            })
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [schoolId]);

    const units = useMemo(() => flattenClassesWithSections(classes), [classes]);

    const unit = useMemo(() => {
        if (units.length === 0) return null;
        return units.find((u) => u.key === selectedKey)
            || units.find((u) => u.rawSection?.isClassTeacher)
            || units[0];
    }, [units, selectedKey]);

    const setUnitKey = useCallback((key) => setSelectedKey(key), []);

    // Fallback to the legacy profile class when the teacher has no section-based assignment
    const classId = unit?.classId || userProfile?.assignedClassId || null;
    const sectionId = unit?.sectionId || null;

    return {
        loading,
        units,
        unit,
        classId,
        sectionId,
        label: unit?.label || '',
        setUnitKey
    };
}

export default useTeacherScope;
