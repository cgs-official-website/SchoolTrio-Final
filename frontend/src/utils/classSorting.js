/**
 * Extracts a normalized section name string from any class or section representation.
 * Handles:
 *  - string: 'A' -> 'A'
 *  - object section: { name: 'A' } or { code: 'A' } -> 'A'
 *  - class object with section: { section: 'A' } or { section: { name: 'A' } } -> 'A'
 *  - class object with sections array: { sections: [{ name: 'A' }] } -> 'A'
 *  - class object with multiple sections: { sections: [{ name: 'A' }, { name: 'B' }] } -> 'A, B'
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
 *  - { name: 'I Standard', sections: [{ name: 'A' }] } -> "I Standard - Section A"
 *  - { name: 'I Standard', section: 'A' } -> "I Standard - Section A"
 *  - { name: 'I Standard', sections: [] } -> "I Standard"
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

export default sortClassesAscending;

