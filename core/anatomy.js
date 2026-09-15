// Анатомия цены места: из чего сложено одно место и что остаётся от его цены.
// Новых формул здесь нет — только группировка готового calcCamp, поэтому с метриками сходится по построению.

export const GROUPS = { student: 'Per student', housing: 'Housing', shared: 'Shared', personal: 'My costs' };

// Жильё — ночная статья с местом; остальные статьи группируются по тому, на кого делятся.
const homeGroup = (item) => (item.placeId ? 'housing' : item.split === 'perStudent' ? 'student' : item.split);

const sum = (rows, key) => rows.reduce((s, x) => s + x[key], 0);

export function priceAnatomy(r) {
  const per = (v) => (r.equiv > 0 ? v / r.equiv : NaN);
  const group = (key, rows) => ({ key, rows, total: sum(rows, 'total'), seat: sum(rows, 'seat') });

  const groups = ['student', 'housing', 'shared'].map((key) => group(key, r.items
    .filter((i) => homeGroup(i) === key)
    .map((i) => ({ item: i, quantity: i.quantity - i.quantityToMe, total: i.toStudents, seat: i.perStudent }))));

  // Мои ночи в общем жилье — тоже мои расходы: отдельная строка той же статьи.
  const personal = group('personal', r.items
    .filter((i) => i.split === 'personal' || (i.placeId && i.quantityToMe > 0))
    .map((i) => ({ item: i, myNights: i.split !== 'personal', quantity: i.quantityToMe, total: i.toMe, seat: i.personalPerStudent })));

  return {
    groups,
    reserve: { total: r.totals.reserve, seat: r.seat.reserve },
    seatCost: { total: r.totals.direct + r.totals.shared + r.totals.reserve, seat: r.seat.cost },
    personal,
    breakeven: { total: r.totals.cost, seat: r.seat.breakeven },
    // Выручка на место, а не цена места: у кого-то своя цена, и тогда «цена − в ноль» не равнялась бы прибыли.
    revenue: { total: r.totals.revenue, seat: per(r.totals.revenue) },
    profit: { total: r.totals.profit, seat: per(r.totals.profit) },
  };
}

// Ключ строки: у статьи жилья бывает вторая строка — мои ночи.
export const rowKey = (row) => (row.myNights ? `${row.item.id}-me` : row.item.id);

// Место по строкам — чтобы строка факта нашла свою пару в плане («факт поверх плана»).
export function seatsByRow(a) {
  const rows = [...a.groups.flatMap((g) => g.rows), ...a.personal.rows];
  return new Map([...rows.map((row) => [rowKey(row), row.seat]), ['reserve', a.reserve.seat]]);
}

/* Куда уходят деньги кемпа: из выручки по шагу вычитаются расходы, остаётся прибыль,
   к ней возвращается гонорар за мою работу. mine — часть шага, которая на деле достаётся мне. */
export function contractFlow(r, a = priceAnatomy(r)) {
  const mineOf = (rows) => rows.reduce((s, x) => s + (x.item.mine ? x.total : 0), 0);
  const costs = [
    ...a.groups.map((g) => ({ key: g.key, value: g.total, mine: mineOf(g.rows) })),
    { key: 'reserve', value: a.reserve.total, mine: 0 },
    { key: 'personal', value: a.personal.total, mine: 0 },
  ].filter((s) => s.value !== 0);
  return { revenue: r.totals.revenue, costs, profit: r.totals.profit, fee: r.mine.fee, take: r.mine.take, outflow: r.mine.outflow };
}
