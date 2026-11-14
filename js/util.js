// @ts-check
// Small helpers shared across the app.

/** Escape text for safe insertion into innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lowercase and strip diacritics so "Cà phê" and "ca phe" compare equal.
 * "đ" is a separate letter (not a combining mark), so it is mapped by hand.
 */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Fisher–Yates shuffle, returns a new array. */
export function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Today's date in the device's local time zone, as YYYY-MM-DD. */
export function today() {
  return toISODate(new Date());
}

/** @param {Date} d */
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add whole days to a YYYY-MM-DD date string. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/** Days within which a word counts as "new" (badge in the word list). */
export const NEW_DAYS = 14;

/** True if a YYYY-MM-DD date is within the last NEW_DAYS days. */
export function isRecent(isoDate) {
  return typeof isoDate === 'string' && isoDate >= addDays(today(), -NEW_DAYS);
}
