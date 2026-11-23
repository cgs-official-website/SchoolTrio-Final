import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { classesApi } from '../../../../api/classes';
import { sortClassesAscending, sortSectionsAscending } from '../../../../utils/classSorting';

// Class list responses may or may not carry section ids; fetch them per class when they do not.
const needsSectionFetch = (c) =>
  !Array.isArray(c.sections) || c.sections.some((s) => !s || typeof s !== 'object' || !s.id);

/** Returns { classOptions: [{value,label}], sectionOptions: [{value,label,classId}] } */
export default function useClassSectionOptions() {
  const [classOptions, setClassOptions] = useState([]);
  const [sectionOptions, setSectionOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const classRes = await classesApi.listClasses({ limit: 100 });
        const classes = sortClassesAscending(classRes?.data || []);

        const fetched = {};
        await Promise.all(
          classes.filter(needsSectionFetch).map(async (c) => {
            try {
              const res = await classesApi.listSections(c.id);
              fetched[c.id] = res?.data || [];
            } catch {
              fetched[c.id] = [];
            }
          })
        );

        if (cancelled) return;

        const classList = [];
        const sectionList = [];
        for (const c of classes) {
          classList.push({ value: c.id, label: c.name });
          const sections = needsSectionFetch(c) ? fetched[c.id] || [] : c.sections;
          for (const s of sortSectionsAscending(sections)) {
            if (!s || typeof s !== 'object' || !s.id) continue;
            sectionList.push({ value: s.id, classId: c.id, label: s.name });
          }
        }

        setClassOptions(classList);
        setSectionOptions(sectionList);
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Failed to load classes and sections.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { classOptions, sectionOptions };
}