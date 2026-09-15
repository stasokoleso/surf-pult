import { countedResult } from '../core/calc.js';

const UNDATED = '';

// Всё, что показывает экран списка, — одной чистой функцией: её проверяет тест без браузера.
export function buildList(camps, { q = '', year = 'all' } = {}) {
  const years = [...new Set(camps.map((c) => c.startDate.slice(0, 4)).filter(Boolean))].sort().reverse();
  // Год, которого больше нет (удалили последний кемп), не должен оставлять пустой экран.
  const activeYear = years.includes(year) ? year : 'all';
  const needle = q.trim().toLowerCase();

  const rows = camps
    .filter((c) => activeYear === 'all' || c.startDate.startsWith(`${activeYear}-`))
    .filter((c) => !needle || c.name.toLowerCase().includes(needle))
    .map(toRow);

  const byMonth = new Map();
  for (const row of rows) {
    const key = row.startDate.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }
  // Без даты — сверху: это черновики, над ними сейчас и работаешь. Дальше месяцы от новых к старым.
  const keys = [...byMonth.keys()]
    .sort((a, b) => (a === UNDATED ? -1 : b === UNDATED ? 1 : b.localeCompare(a)));

  return {
    years,
    year: activeYear,
    groups: keys.map((key) => {
      const list = byMonth.get(key).sort(key === UNDATED ? byEdited : byStart);
      return { key, rows: list, sums: sumByCurrency(list) };
    }),
    total: {
      n: rows.length,
      students: rows.reduce((s, r) => s + r.students, 0),
      sums: sumByCurrency(rows),
      usesFact: rows.some((r) => r.basis === 'fact'),
    },
  };
}

function toRow(camp) {
  const r = countedResult(camp);
  return {
    id: camp.id,
    name: camp.name,
    status: camp.status,
    startDate: camp.startDate,
    updatedAt: camp.updatedAt,
    currency: camp.currency,
    days: r.days,
    basis: r.scenario,
    students: r.studentCount,
    profit: r.totals.profit,
    take: r.mine.take,
  };
}

const byStart = (a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name);
const byEdited = (a, b) => b.updatedAt.localeCompare(a.updatedAt);

// Разные валюты не складываем: $ и € в одном числе — неправда.
function sumByCurrency(rows) {
  const out = new Map();
  for (const r of rows) {
    const s = out.get(r.currency) ?? { currency: r.currency, take: 0, profit: 0 };
    s.take += r.take;
    s.profit += r.profit;
    out.set(r.currency, s);
  }
  return [...out.values()];
}
