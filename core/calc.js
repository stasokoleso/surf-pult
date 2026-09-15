// Расчёт кемпа: состав → статьи → метрики. Чистые функции — без интерфейса и хранилища.
// При ровном составе (все ученики на весь кемп) цифры совпадают со старым Пультом до цента.
import { num, placeholderStudents, staysLike } from './model.js';

export function unitMultiplier(unit, span) {
  if (unit === 'night') return num(span.nights);
  if (unit === 'day') return num(span.days);
  if (unit === 'session') return num(span.sessions);
  return 1;
}

// Сколько дней, ночей и сессий человек проводит в кемпе.
function spanOf(person, camp) {
  const D = Math.max(1, num(camp.days, 1));
  if (person.from === null && person.to === null) {
    return { whole: true, from: 1, to: D, days: D, nights: num(camp.nights), sessions: num(camp.sessions) };
  }
  const from = person.from ?? 1;
  const to = person.to ?? D;
  const nights = Math.max(0, to - from);
  const days = nights + 1;
  // Сессии — целые уроки: пропорционально дням с округлением, но не больше, чем в кемпе.
  const sessions = Math.min(num(camp.sessions), Math.round(num(camp.sessions) * days / D));
  return { whole: false, from, to, days, nights, sessions };
}

function nightsAt(person, span, placeId) {
  return person.stays.reduce((sum, st) => {
    if (st.placeId !== placeId) return sum;
    if (st.from === null && st.to === null) return sum + span.nights;
    return sum + Math.max(0, (st.to ?? span.to) - (st.from ?? span.from));
  }, 0);
}

/* scenario — 'plan' или 'fact': из статей и цены берётся соответствующее число.

   Куда идут деньги статьи:
   · жильё (ночная статья с местом) — по ночам каждого живущего: ученику в его место,
     персоналу в общий котёл, мне в мои личные;
   · «на каждого ученика» — по личным дням, ночам и сессиям каждого ученика;
   · «общее на группу» — по дням кемпа, в общий котёл;
   · «мои личные» — по моим дням, если я есть в составе, иначе по дням кемпа.
   Общий котёл делится между учениками пропорционально дням присутствия. */
export function calcCamp(camp, scenario = 'plan') {
  const D = Math.max(1, num(camp.days, 1));
  const campSpan = { days: D, nights: num(camp.nights), sessions: num(camp.sessions) };
  const reservePct = num(camp.reservePct);
  const price = num(camp.price[scenario]);

  const people = camp.people.map((person) => ({ person, span: spanOf(person, camp) }));
  const students = people.filter((x) => x.person.role === 'student');
  const mes = people.filter((x) => x.person.role === 'me');
  const studentDays = students.reduce((s, x) => s + x.span.days, 0);
  // Сколько это «полных учеников»: двое на полкемпа — один полный. На это делим «на ученика».
  const equiv = studentDays / D;
  const per = (v) => (equiv > 0 ? v / equiv : NaN);
  // Сколько мест платят общую цену: у кого своя цена, от цены места не зависит.
  const priced = students.reduce((s, x) => s + (x.person.price === null ? x.span.days / D : 0), 0);

  const direct = new Map(students.map((x) => [x.person.id, 0]));
  let sharedItems = 0;
  let staff = 0;
  let personal = 0;

  const items = camp.items.map((item) => {
    const rate = num(item[scenario]);
    let toStudents = 0;
    let toMe = 0;
    let quantity = 0;
    let quantityToMe = 0;

    if (item.placeId) {
      for (const { person, span } of people) {
        const n = nightsAt(person, span, item.placeId);
        if (!n) continue;
        quantity += n;
        if (person.role === 'student') {
          direct.set(person.id, direct.get(person.id) + rate * n);
          toStudents += rate * n;
        } else if (person.role === 'staff') {
          staff += rate * n;
          toStudents += rate * n;
        } else {
          personal += rate * n;
          toMe += rate * n;
          quantityToMe += n;
        }
      }
    } else if (item.split === 'perStudent') {
      for (const { person, span } of students) {
        const m = unitMultiplier(item.unit, span);
        direct.set(person.id, direct.get(person.id) + rate * m);
        toStudents += rate * m;
        quantity += m;
      }
    } else if (item.split === 'shared') {
      const m = unitMultiplier(item.unit, campSpan);
      sharedItems += rate * m;
      toStudents += rate * m;
      quantity += m;
    } else {
      for (const { span } of mes.length ? mes : [{ span: campSpan }]) {
        const m = unitMultiplier(item.unit, span);
        personal += rate * m;
        toMe += rate * m;
        quantity += m;
        quantityToMe += m;
      }
    }

    return {
      id: item.id, name: item.name, unit: item.unit, split: item.split, placeId: item.placeId, mine: item.mine,
      // quantityToMe — мои ночи в общем жилье: без него «ставка × количество» в строке не сойдётся с итогом
      rate, quantity, quantityToMe, total: toStudents + toMe, toStudents, toMe,
      // «на ученика» — до резерва; сумма по статьям × (1 + резерв) = себестоимость места
      perStudent: per(toStudents),
      personalPerStudent: per(toMe),
    };
  });

  const pool = sharedItems + staff;
  const studentRows = students.map(({ person, span }) => {
    const own = direct.get(person.id);
    const shared = studentDays > 0 ? pool * span.days / studentDays : 0;
    const base = own + shared;
    const reserve = base * reservePct / 100;
    const revenue = person.price !== null ? person.price : span.whole ? price : price / D * span.days;
    return {
      id: person.id, name: person.name, from: span.from, to: span.to,
      days: span.days, nights: span.nights, sessions: span.sessions,
      direct: own, shared, reserve, cost: base + reserve, revenue, profit: revenue - base - reserve,
    };
  });

  const sum = (key) => studentRows.reduce((s, x) => s + x[key], 0);
  const totDirect = sum('direct');
  const reserve = sum('reserve');
  const cost = totDirect + pool + reserve + personal;
  const revenue = sum('revenue');
  const profit = revenue - cost;
  const seatCost = per(totDirect + pool + reserve);
  const breakeven = per(cost);
  const fee = items.filter((i) => i.mine).reduce((s, i) => s + i.total, 0);

  return {
    scenario,
    days: D,
    studentCount: students.length,
    studentDays,
    equiv,
    priced,
    totals: { direct: totDirect, shared: pool, sharedItems, staff, personal, reserve, cost, revenue, profit },
    seat: { price, direct: per(totDirect), shared: per(pool), reserve: per(reserve), cost: seatCost, breakeven },
    perDay: { price: price / D, cost: seatCost / D, breakeven: breakeven / D },
    margin: revenue > 0 ? profit / revenue * 100 : NaN,
    // «Мой подряд»: гонорар по моим статьям остаётся у меня, мои личные расходы уже вычтены в прибыли
    mine: { fee, take: fee + profit, outflow: cost - fee },
    items,
    students: studentRows,
    hasFact: num(camp.price.fact) !== 0 || camp.items.some((i) => num(i.fact) !== 0),
  };
}

/* «Если группа другая»: добавляем или убираем учеников на весь кемп, остальной состав не трогаем.
   null — столько не убрать: учеников на весь кемп меньше. */
export function withStudentCount(camp, count) {
  const students = camp.people.filter((p) => p.role === 'student');
  const current = students.length;
  const delta = count - current;
  // Добавленные живут там же, где последний ученик: иначе в кемпе с виллой лишний ученик выходил бы без жилья.
  if (delta >= 0) {
    return { ...camp, people: [...camp.people, ...placeholderStudents(delta, current + 1, staysLike(students[current - 1]))] };
  }
  const whole = camp.people.filter((p) => p.role === 'student' && p.from === null && p.to === null);
  if (-delta > whole.length) return null;
  const drop = new Set(whole.slice(delta).map((p) => p.id));
  return { ...camp, people: camp.people.filter((p) => !drop.has(p.id)) };
}

/* «Если группа другая»: прибыль и «моё на руки» при разном числе учеников на весь кемп.
   Учеников со своими датами примерка не убирает — меньше их числа кривая не опускается. */
export function studentCurve(camp, scenario = 'plan') {
  const students = camp.people.filter((p) => p.role === 'student');
  const actual = students.length;
  const fixed = students.filter((p) => p.from !== null || p.to !== null).length;
  const lo = Math.max(1, fixed);
  const hi = Math.max(lo + 6, actual + 6, Math.ceil(actual * 1.5));
  const points = [];
  for (let n = lo; n <= hi; n++) {
    const r = calcCamp(withStudentCount(camp, n), scenario);
    points.push({ n, profit: r.totals.profit, take: r.mine.take });
  }
  return { lo, hi, actual, points };
}

/* Цена места, при которой «на руки» (прибыль + мой подряд) ровно цель.
   От цены зависит только выручка тех, кто платит общую цену: каждый евро цены даёт `priced` евро.
   Старый Пульт делил на всех учеников — на неровном составе и со своими ценами это промах. */
export function priceForTarget(result, target) {
  const diff = result.priced > 0 ? (num(target) - result.mine.take) / result.priced : NaN;
  const need = result.seat.price + diff;
  return { need, perDay: need / result.days, diff };
}

// Какой расчёт идёт в итоги: у проведённого кемпа с внесённым фактом — факт, иначе план.
export function countedResult(camp) {
  const plan = calcCamp(camp, 'plan');
  if (camp.status !== 'done' || !plan.hasFact) return plan;
  const fact = calcCamp(camp, 'fact');
  return fact.totals.revenue !== 0 ? fact : plan;
}

/* Итоги по набору кемпов.
   Цена и себестоимость «в день» — средневзвешенные по дням учеников,
   иначе короткий кемп искажал бы картину. */
export function rollup(camps) {
  const r = { n: 0, days: 0, students: 0, rev: 0, profit: 0, cost: 0 };
  let studentDays = 0;
  let seatMoney = 0;
  for (const camp of camps) {
    const x = countedResult(camp);
    r.n += 1;
    r.days += x.days;
    r.students += x.studentCount;
    r.rev += x.totals.revenue;
    r.profit += x.totals.profit;
    r.cost += x.totals.cost;
    studentDays += x.studentDays;
    seatMoney += x.totals.direct + x.totals.shared + x.totals.reserve;
  }
  return {
    ...r,
    pricePerDay: studentDays > 0 ? r.rev / studentDays : NaN,
    cpsPerDay: studentDays > 0 ? seatMoney / studentDays : NaN,
    margin: r.rev > 0 ? r.profit / r.rev * 100 : NaN,
  };
}
