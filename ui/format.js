import { dateOfDay } from '../core/model.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

// Суммы на экранах — до целых: центы только мешают сравнивать кемпы между собой.
export function money(value, currency) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.round(Math.abs(value));
  return `${value < 0 && abs > 0 ? '−' : ''}${currency}${abs.toLocaleString('en-US')}`;
}

export const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

// На русской клавиатуре iPhone десятичный знак — запятая, а пробелы разделяют тысячи.
export function parseNumber(text) {
  let t = String(text).replace(/[\s  ]/g, '');
  t = t.includes(',') && t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null;
}

export const campName = (camp) => camp.name.trim() || 'Untitled camp';

// '2026-10' → 'October 2026'
export function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// 'Oct 12–21', 'Oct 28 – Nov 6', 'Dec 28, 2026 – Jan 3, 2027'
export function dateRange(startDate, days) {
  const end = startDate ? dateOfDay(startDate, Math.max(1, Math.round(days))) : null;
  if (!end) return '';
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const day = (m, d) => `${SHORT[m - 1]} ${d}`;
  if (y1 !== y2) return `${day(m1, d1)}, ${y1} – ${day(m2, d2)}, ${y2}`;
  if (m1 !== m2) return `${day(m1, d1)} – ${day(m2, d2)}`;
  return d1 === d2 ? day(m1, d1) : `${day(m1, d1)}–${d2}`;
}
