/**
 * Formats a date string or Date object to DD-MM-YYYY format for UI display in lists and tables.
 *
 * @param {string|Date} dateInput
 * @returns {string} Formatted date as DD-MM-YYYY or '-'
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return '-';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '-';

    // 1. YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
    const ymd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymd) {
      const [, y, m, d] = ymd;
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d)}-${pad(m)}-${y}`;
    }

    // 2. DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
    const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d)}-${pad(m)}-${y}`;
    }
  }

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};
