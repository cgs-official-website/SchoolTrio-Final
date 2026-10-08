/**
 * src/utils/classSorting.js
 *
 * Canonical utility module for Class and Section normalization, sorting, formatting,
 * and flattening into individual class-section selection units.
 */

/**
 * Extracts a normalized section name string from any class or section representation.
 * Handles:
 *  - string: 'A' -> 'A'
 *  - object section: { name: 'A' } or { code: 'A' } -> 'A'
 *  - class object with section: { section: 'A' } or { section: { name: 'A' } } -> 'A'
 *  - class object with sections array: { sections: [{ name: 'A' }] } -> 'A'
 *  - class object with multiple sections: { sections: [{ name: 'A' }, { name: 'B' }] } -> 'A, B' (for parent-class summaries)
 *  - class object with sectionName: { sectionName: 'A' } -> 'A'
 *
 * @param {string|Object} classOrSection
 * @returns {string} Normalized section name
 */
export const getSectionName = (classOrSection) => {
  if (!classOrSection) return '';
  if (typeof classOrSection === 'string') return classOrSection.trim();

  // If object has a direct `section` property
  if (classOrSection.section !== undefined && classOrSection.section !== null) {
    if (typeof classOrSection.section === 'string') {
      return classOrSection.section.trim();
    }
    if (typeof classOrSection.section === 'object') {
      return (classOrSection.section.name || classOrSection.section.code || '').toString().trim();
    }
  }

  // If object has `sectionName` property
  if (typeof classOrSection.sectionName === 'string') {
    return classOrSection.sectionName.trim();
  }

  // If object has `sections` array
  if (Array.isArray(classOrSection.sections) && classOrSection.sections.length > 0) {
    return classOrSection.sections
      .map(s => {
        if (!s) return '';
        if (typeof s === 'string') return s.trim();
        if (typeof s === 'object') return (s.name || s.code || '').toString().trim();
        return String(s).trim();
      })
      .filter(Boolean)
      .join(', ');
  }

  // If it's a standalone section object (has code or sectionCode)
  if (classOrSection.code || classOrSection.sectionCode) {
    return (classOrSection.name || classOrSection.code || classOrSection.sectionCode).toString().trim();
  }

  return '';
};

/**
 * Formats a class and its section for consistent presentation across the UI.
 * Examples:
 *  - { name: 'Class 10', section: 'A' } -> "Class 10 - Section A"
 *  - { name: 'Grade 7', sections: [{ name: 'A' }] } -> "Grade 7 - Section A"
 *  - { name: 'Class 10', sections: [] } -> "Class 10"
 *
 * @param {string|Object} c - Class record or string
 * @returns {string} Formatted class and section string
 */
export const formatClassSection = (c) => {
  if (!c) return '';
  if (typeof c === 'string') return c;

  const className = (c.name || c.className || c.title || '').toString().trim();
  const sectionName = getSectionName(c);

  if (!sectionName) return className;

  const cleanClassName = className.toLowerCase();
  const cleanSectionName = sectionName.toLowerCase();

  // Prevent duplicate section labels if className already contains it
  if (
    cleanClassName.endsWith(`section ${cleanSectionName}`) ||
    cleanClassName.endsWith(`- ${cleanSectionName}`) ||
    cleanClassName.endsWith(`(${cleanSectionName})`)
  ) {
    return className;
  }

  return `${className} - Section ${sectionName}`;
};

/**
 * Sorts an array of class objects in natural ascending order by class name and then section.
 * Example order:
 *  - Nursery - A
 *  - LKG - A
 *  - UKG - A
 *  - Class 1 - A
 *  - Class 1 - B
 *  - Class 2 - A
 *  - Class 10 - A
 *  - Class 12 - A
 *
 * @param {Array<Object>} classes - Array of class objects ({ name, section, sections, ... })
 * @returns {Array<Object>} Sorted array of classes
 */
export const sortClassesAscending = (classes = []) => {
  if (!Array.isArray(classes)) return [];
  return [...classes].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    const nameA = (a.name || a.className || a.title || '').toString().trim();
    const nameB = (b.name || b.className || b.title || '').toString().trim();

    const nameCompare = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;

    const sectionA = getSectionName(a);
    const sectionB = getSectionName(b);

    return sectionA.localeCompare(sectionB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Sorts an array of section strings or section objects in natural ascending order.
 * Example order:
 *  - 'A', 'B', 'C', 'D'
 *
 * @param {Array<string|Object>} sections - Array of section strings or objects with `section` property
 * @returns {Array<string|Object>} Sorted sections
 */
export const sortSectionsAscending = (sections = []) => {
  if (!Array.isArray(sections)) return [];
  return [...sections].sort((a, b) => {
    const getSec = (item) => {
      if (!item) return '';
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'object') {
        return (item.name || item.code || item.section || item.sectionName || '').toString().trim();
      }
      return String(item).trim();
    };
    const secA = getSec(a);
    const secB = getSec(b);
    return secA.localeCompare(secB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Flattens hierarchical Class records into individual Class + Section selectable units.
 * Every option preserves:
 *  - id: stable composite or section UUID identifier
 *  - key: unique key for React rendering
 *  - value: selection identifier
 *  - classId: UUID of parent Class
 *  - sectionId: UUID of Section (or null if class has no sections)
 *  - name / className: Parent Class Name (e.g. "Grade 7")
 *  - section / sectionName: Section Name (e.g. "A")
 *  - label: Formatted individual label (e.g. "Grade 7 - Section A")
 *  - rawClass: Original parent class object
 *  - rawSection: Original section object (if available)
 *
 * Natural sorting is applied in ascending order.
 *
 * @param {Array<Object>} classes - Array of Class objects
 * @returns {Array<Object>} Flat array of individual class-section selection objects
 */
export const flattenClassesWithSections = (classes = []) => {
  if (!Array.isArray(classes)) return [];
  const list = [];

  for (const c of classes) {
    if (!c) continue;
    const classId = c.id || c.classId || '';
    const className = (c.name || c.className || c.title || '').toString().trim();

    if (Array.isArray(c.sections) && c.sections.length > 0) {
      for (const s of c.sections) {
        if (!s) continue;
        const secId = typeof s === 'object' && s.id ? s.id : null;
        const secName = typeof s === 'object' ? (s.name || s.code || '').toString().trim() : String(s).trim();
        const unitId = secId ? `${classId}_${secId}` : (secName ? `${classId}_${secName}` : classId);
        const label = secName ? formatClassSection({ name: className, section: secName }) : className;

        list.push({
          id: unitId,
          key: `${classId}:${secId || secName}`,
          value: unitId,
          classId,
          sectionId: secId,
          name: className,
          className,
          section: secName,
          sectionName: secName,
          label,
          rawClass: c,
          rawSection: typeof s === 'object' ? s : null
        });
      }
    } else if (typeof c.section === 'string' && c.section.includes(',')) {
      const splitSecs = c.section.split(',').map(s => s.trim()).filter(Boolean);
      for (const secName of splitSecs) {
        const unitId = `${classId}_${secName}`;
        const label = formatClassSection({ name: className, section: secName });
        list.push({
          id: unitId,
          key: `${classId}:${secName}`,
          value: unitId,
          classId,
          sectionId: null,
          name: className,
          className,
          section: secName,
          sectionName: secName,
          label,
          rawClass: c,
          rawSection: null
        });
      }
    } else if (c.section) {
      const secName = typeof c.section === 'object' ? (c.section.name || c.section.code || '').toString().trim() : String(c.section).trim();
      const secId = c.sectionId || (typeof c.section === 'object' ? c.section.id : null);
      const unitId = secId ? `${classId}_${secId}` : (secName ? `${classId}_${secName}` : classId);
      const label = secName ? formatClassSection({ name: className, section: secName }) : className;

      list.push({
        id: unitId,
        key: `${classId}:${secId || secName}`,
        value: unitId,
        classId,
        sectionId: secId,
        name: className,
        className,
        section: secName,
        sectionName: secName,
        label,
        rawClass: c,
        rawSection: typeof c.section === 'object' ? c.section : null
      });
    } else {
      list.push({
        id: classId,
        key: classId,
        value: classId,
        classId,
        sectionId: null,
        name: className,
        className,
        section: '',
        sectionName: '',
        label: className,
        rawClass: c,
        rawSection: null
      });
    }
  }

  return sortClassesAscending(list);
};

export default sortClassesAscending;
