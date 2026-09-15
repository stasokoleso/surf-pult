// Модель кемпа: схема, значения по умолчанию и приведение к ней чего угодно.
// Ни интерфейса, ни хранилища — поэтому всё проверяется в node --test.

export const SCHEMA = 2;

export const UNITS = { night: 'per night', day: 'per day', session: 'per session', once: 'one-off' };
export const SPLITS = { perStudent: 'per student', shared: 'shared by group', personal: 'my own' };
export const ROLES = { student: 'Student', staff: 'Staff', me: 'Me' };
export const STATUSES = { draft: 'Draft', planned: 'Planned', done: 'Done' };

// hasOwn, а не STATUSES[x]: строка "constructor" из битого файла иначе сошла бы за статус.
const known = (dict, key) => typeof key === 'string' && Object.hasOwn(dict, key);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : '');
const blank = (v) => v === undefined || v === null || v === '' || Number.isNaN(Number(v));
export const num = (v, def = 0) => (blank(v) ? def : Number(v));
const dayNum = (v) => (blank(v) ? null : Math.round(Number(v)));
const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const newId = () => crypto.randomUUID();

/* ---------- дни, ночи, цена ---------- */

// Тур на 10 дней — это 9 ночей. Меняешь одно — второе едет следом,
// иначе половина сметы считается по забытой цифре.
export const nightsForDays = (d) => Math.max(0, Math.round(d) - 1);
export const daysForNights = (n) => Math.max(1, Math.round(n) + 1);

// Цена места и ставка в день — одно число с двух сторон. Храним цену места,
// а price.hold говорит, что держать, когда меняется длина кемпа.
export const dayRate = (camp) =>
  Math.round(num(camp.price.plan) / Math.max(1, num(camp.days, 1)) * 100) / 100;

export function setLength(camp, days, nights) {
  const rate = dayRate(camp);
  const next = { ...camp, days: Math.max(1, days), nights: Math.max(0, nights) };
  // Кемп стал короче — даты людей обрезаются по его концу, иначе лишние дни остались бы в расчёте.
  const cut = (d) => (d === null ? null : Math.min(d, next.days));
  const over = (x) => x.from > next.days || x.to > next.days;
  next.people = camp.people.map((p) => (over(p) || p.stays.some(over)
    ? { ...p, from: cut(p.from), to: cut(p.to), stays: p.stays.map((st) => ({ ...st, from: cut(st.from), to: cut(st.to) })) }
    : p));
  if (camp.price.hold === 'rate') {
    next.price = { ...camp.price, plan: Math.round(rate * next.days * 100) / 100 };
  }
  return next;
}

/* ---------- люди ---------- */

// from/to — номер дня кемпа (день 1 = дата старта), null — граница кемпа.
// Номера, а не даты: кемп можно двигать по календарю, и черновик без даты тоже считается.
export function makePerson({ name = '', role = 'student', from = null, to = null, price = null, stays = [] } = {}) {
  return { id: newId(), name, role, from, to, price, stays };
}

// Новый человек заселяется туда же, где живёт образец, если у образца одно место: переезды не копируем.
export const staysLike = (person) =>
  (person?.stays.length === 1 ? [{ placeId: person.stays[0].placeId, from: null, to: null }] : []);

export const placeholderStudents = (count, startAt = 1, stays = []) =>
  Array.from({ length: Math.max(0, count) }, (_, i) =>
    makePerson({ name: `Student ${startAt + i}`, stays: stays.map((st) => ({ ...st })) }));

/* ---------- кемп ---------- */

const DEFAULTS = { currency: '$', days: 10, sessions: 8, pricePlan: 900, reservePct: 15 };

export function blankCamp({ now = new Date() } = {}) {
  const item = (name, unit, split, plan) => ({ id: newId(), name, unit, split, mine: false, placeId: null, plan, fact: 0 });
  return normalizeCamp({
    status: 'draft',
    startDate: isoLocal(now),
    days: DEFAULTS.days,
    nights: nightsForDays(DEFAULTS.days),
    sessions: DEFAULTS.sessions,
    price: { plan: DEFAULTS.pricePlan, fact: 0, hold: 'total' },
    reservePct: DEFAULTS.reservePct,
    people: placeholderStudents(6),
    items: [
      item('Accommodation', 'night', 'perStudent', 30),
      item('Surf lesson', 'session', 'perStudent', 25),
      item('Transfer', 'once', 'perStudent', 30),
      item('Videographer', 'once', 'shared', 500),
      item('Car rental', 'day', 'shared', 40),
      item('Flight', 'once', 'personal', 450),
    ],
  });
}

/* Собирает валидный кемп из чего угодно и всегда новым объектом:
   иначе правки открытого кемпа протекали бы в список. */
export function normalizeCamp(src) {
  const s = obj(src);
  const places = arr(s.places).map((p) => ({ id: str(obj(p).id) || newId(), name: str(obj(p).name) }));
  const placeIds = new Set(places.map((p) => p.id));
  const placeRef = (id) => (typeof id === 'string' && placeIds.has(id) ? id : null);
  const days = Math.max(1, num(s.days, DEFAULTS.days));
  const q = obj(s.price);

  return {
    schema: SCHEMA,
    id: str(s.id) || newId(),
    name: str(s.name),
    status: known(STATUSES, s.status) ? s.status : 'draft',
    notes: str(s.notes),
    createdAt: str(s.createdAt),
    updatedAt: str(s.updatedAt),
    startDate: isISODate(s.startDate) ? s.startDate : '',
    currency: typeof s.currency === 'string' ? s.currency : DEFAULTS.currency,
    days,
    nights: Math.max(0, num(s.nights, nightsForDays(days))),
    sessions: Math.max(0, num(s.sessions, 0)),
    price: { plan: num(q.plan), fact: num(q.fact), hold: q.hold === 'rate' ? 'rate' : 'total' },
    reservePct: num(s.reservePct),
    target: num(s.target),
    places,
    people: uniqueIds(arr(s.people).map((p) => normalizePerson(p, placeRef))),
    items: uniqueIds(arr(s.items).map((i) => normalizeItem(i, placeRef))),
  };
}

// Повтор id в битом файле склеивал в расчёте двух людей в одного, и расходы удваивались;
// у статей из-за повтора правка и удаление задевали бы обе.
function uniqueIds(list) {
  const seen = new Set();
  return list.map((x) => {
    const next = seen.has(x.id) ? { ...x, id: newId() } : x;
    seen.add(next.id);
    return next;
  });
}

function normalizePerson(src, placeRef) {
  const o = obj(src);
  let from = dayNum(o.from);
  let to = dayNum(o.to);
  if (from !== null && to !== null && to < from) [from, to] = [to, from];
  return {
    id: str(o.id) || newId(),
    name: str(o.name),
    role: known(ROLES, o.role) ? o.role : 'student',
    from,
    to,
    // null — платит по общей цене; число — договорились отдельно
    price: blank(o.price) ? null : Number(o.price),
    stays: arr(o.stays).map((st) => {
      const x = obj(st);
      return { placeId: placeRef(x.placeId), from: dayNum(x.from), to: dayNum(x.to) };
    }),
  };
}

function normalizeItem(src, placeRef) {
  const o = obj(src);
  const unit = known(UNITS, o.unit) ? o.unit : 'once';
  // Место бывает только у ночной статьи — это и есть жильё. Кому жильё в расходы, решает роль
  // живущего (ученику — в его место, персоналу — в общие, мне — в личные), поэтому вид у него не выбирается.
  const placeId = unit === 'night' ? placeRef(o.placeId) : null;
  const split = placeId ? 'perStudent' : known(SPLITS, o.split) ? o.split : 'perStudent';
  return {
    id: str(o.id) || newId(),
    name: str(o.name),
    unit,
    split,
    placeId,
    // «Мой подряд»: в цене тура статья есть, но деньги за неё получаю я.
    // У моих личных расходов такого не бывает — это я плачу, а не мне.
    mine: o.mine === true && split !== 'personal',
    plan: num(o.plan),
    fact: num(o.fact),
  };
}

/* ---------- даты ---------- */

// Считаем в UTC: переход на летнее время иначе даёт сутки в 23 часа, и номер дня съезжает.
const DAY_MS = 86_400_000;
const utcDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : null;
};

// Номер дня кемпа по дате и обратно; день 1 — дата старта.
export function dayOfDate(startDate, date) {
  const a = utcDay(startDate);
  const b = utcDay(date);
  return a === null || b === null ? null : b - a + 1;
}

export function dateOfDay(startDate, n) {
  const a = utcDay(startDate);
  return a === null ? null : new Date((a + n - 1) * DAY_MS).toISOString().slice(0, 10);
}

// Дату собираем вручную: toISOString() переводит в UTC и в плюсовых зонах сдвигает день назад.
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
