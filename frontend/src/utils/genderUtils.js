/**
 * Normalizes any gender input string to standard title case: 'Male', 'Female', 'Other', or a fallback.
 * Handles variations such as:
 * - Male / Boy / boy / BOY / male / M / m / Man / man / gentleman
 * - Female / Girl / girl / GIRL / female / F / f / Woman / woman / lady
 * - Other / other / O / o / Transgender / Non-binary
 */
export const normalizeGender = (val, defaultVal = 'Male') => {
  if (!val) return defaultVal;
  const str = String(val).trim().toLowerCase();
  if (['m', 'male', 'boy', 'b', 'man', 'gentleman'].includes(str)) return 'Male';
  if (['f', 'female', 'girl', 'g', 'woman', 'lady'].includes(str)) return 'Female';
  if (['o', 'other', 'transgender', 'non-binary', 'nonbinary'].includes(str)) return 'Other';
  return defaultVal;
};

export const isMale = (val) => normalizeGender(val, '') === 'Male';
export const isFemale = (val) => normalizeGender(val, '') === 'Female';
export const isOther = (val) => normalizeGender(val, '') === 'Other';
