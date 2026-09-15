// Перевод кемпов старого Пульта (pult.html) в схему v2.
// Главное правило: у кемпа с ровным составом ни одна цифра не сдвигается — это проверяет сверка.
import { dayOfDate, newId, normalizeCamp, placeholderStudents } from './model.js';

const KIND_TO_SPLIT = { student: 'perStudent', shared: 'shared', organizer: 'personal' };
const KIND_ORDER = ['student', 'shared', 'organizer'];
const UNITS = ['night', 'day', 'session', 'once'];
const ROLES = ['student', 'staff', 'me'];
// Умолчания старого Пульта (blankCamp в pult.html): пропуски в данных он заполнял ими,
// значит и переводить надо с ними — иначе цифры кемпа тихо поменяются.
const OLD = { students: 6, days: 10, nights: 9, sessions: 8, pricePlan: 900, reserve: 15, currency: '$' };

const blank = (v) => v === undefined || v === null || v === '' || Number.isNaN(Number(v));
const num = (v, def) => (blank(v) ? def : Number(v));
const obj = (v) => (v && typeof v === 'object' ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const isLegacyCamp = (o) =>
  !!o && typeof o === 'object' && o.schema === undefined && ('params' in o || 'rows' in o || 'cats' in o);

// Копия старого Пульта бывает массивом кемпов или объектом { app, camps, savedAt }.
export function readLegacyFile(json) {
  const list = Array.isArray(json) ? json : arr(obj(json).camps);
  const camps = [];
  const warnings = [];
  for (const src of list) {
    if (!obj(src).id) continue; // старый Пульт тоже пропускал записи без id
    const res = fromLegacy(src);
    camps.push(res.camp);
    warnings.push(...res.warnings.map((w) => `${res.camp.name || 'Untitled'}: ${w}`));
  }
  return { camps, warnings };
}

export function fromLegacy(src) {
  const s = obj(src);
  const p = obj(s.params);
  const q = obj(s.price);
  const roster = obj(s.roster);
  const rows = legacyRows(s);
  const warnings = [];

  let parts;
  if (roster.on === true && arr(roster.people).length > 0) {
    parts = fromRoster(s, roster, rows, warnings);
  } else {
    const students = Math.max(1, num(p.students, OLD.students));
    if (!Number.isInteger(students)) warnings.push(`student count was ${students}, rounded to ${Math.round(students)}`);
    if (arr(roster.people).length > 0) warnings.push('"People & housing" was off: used the plain student count, the people list was not imported');
    parts = { places: [], people: placeholderStudents(Math.round(students)), items: rows.map(toItem) };
  }

  const camp = normalizeCamp({
    id: s.id,
    name: s.name,
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    startDate: s.startDate,
    currency: s.currency !== undefined ? s.currency : OLD.currency,
    days: Math.max(1, num(p.days, OLD.days)),
    nights: num(p.nights, OLD.nights),
    sessions: num(p.sessions, OLD.sessions),
    price: { plan: num(q.plan, OLD.pricePlan), fact: num(q.fact, 0), hold: q.mode === 'day' ? 'rate' : 'total' },
    reservePct: s.reserve !== undefined ? num(s.reserve, OLD.reserve) : num(s.cont, 0) + num(s.mkt, 0),
    target: num(s.target, 0),
    ...parts,
  });
  return { camp, warnings };
}

function legacyRows(s) {
  const raw = Array.isArray(s.rows)
    ? s.rows
    : KIND_ORDER.flatMap((kind) => arr(obj(s.cats)[kind]).map((r) => ({ ...obj(r), kind })));
  return raw.map((r) => {
    const o = obj(r);
    return {
      name: o.name || '',
      kind: KIND_ORDER.includes(o.kind) ? o.kind : 'student',
      unit: UNITS.includes(o.unit) ? o.unit : 'once',
      plan: num(o.plan, 0),
      fact: num(o.fact, 0),
    };
  });
}

const toItem = (r) => ({
  name: r.name, unit: r.unit, split: KIND_TO_SPLIT[r.kind], mine: false, placeId: null, plan: r.plan, fact: r.fact,
});

/* Кемп, где был включён прототип «Люди и жильё». Повторяем, как его считал старый Пульт:
   жильё — из ставок мест, ночные статьи «на ученика» и «мои личные» при этом не считались. */
function fromRoster(s, roster, rows, warnings) {
  const rPeople = arr(roster.people).map(obj);
  const rStays = arr(roster.stays).map(obj);
  const rPlaces = arr(roster.places).map(obj).filter((pl) => pl.id);

  const allDates = [...rPeople, ...rStays].flatMap((x) => [x.from, x.to]).filter(isDate).sort();
  const start = isDate(s.startDate) ? s.startDate : allDates[0];
  const day = (date) => dayOfDate(start, date);
  let undated = 0;

  const people = rPeople.map((pr) => {
    const dated = isDate(pr.from) && isDate(pr.to);
    if (!dated) undated++;
    // Без дат старый Пульт давал человеку ноль ночей и один день — повторяем.
    const from = dated ? day(pr.from) : 1;
    const to = dated ? Math.max(from, day(pr.to)) : from;
    const stays = pr.id
      ? rStays.filter((x) => x.personId === pr.id).map((x) => {
        const ok = isDate(x.from) && isDate(x.to);
        const a = ok ? day(x.from) : from;
        return { placeId: x.placeId || null, from: a, to: ok ? Math.max(a, day(x.to)) : a };
      })
      : [];
    return {
      id: pr.id || newId(),
      name: pr.name || '',
      role: ROLES.includes(pr.role) ? pr.role : 'student',
      from,
      to,
      price: blank(pr.price) ? null : Number(pr.price),
      stays,
    };
  });
  if (undated) warnings.push(`${undated} of the people in "People & housing" had no dates: counted as one day, as the old Pult did`);

  const replaced = (r) => r.unit === 'night' && r.kind !== 'shared';
  const dropped = rows.filter(replaced);
  if (dropped.length) {
    warnings.push(`nightly items ${dropped.map((r) => `"${r.name}"`).join(', ')} were replaced by housing from "People & housing", as the old Pult did`);
  }
  const hasMe = rPeople.some((pr) => pr.role === 'me');
  if (!hasMe && rows.some((r) => r.kind === 'organizer' && !replaced(r))) {
    warnings.push('"People & housing" had no "Me": the old Pult then skipped my own costs, the new one counts them');
  }

  // Факта жилья в «Людях и жилье» не было. Нулевой факт у кемпа, где факт уже внесён, сделал бы жильё
  // бесплатным и прибыль по факту завышенной — поэтому берём плановую ставку и просим проверить.
  const hasFact = num(obj(s.price).fact, 0) !== 0 || rows.some((r) => r.fact !== 0);
  const housing = rPlaces
    .filter((pl) => num(pl.rate, 0) !== 0)
    .map((pl) => ({
      name: pl.name || 'Housing', unit: 'night', split: 'perStudent', mine: false, placeId: pl.id,
      plan: Number(pl.rate), fact: hasFact ? Number(pl.rate) : 0,
    }));
  if (hasFact && housing.length) {
    warnings.push('"People & housing" had no actual housing costs: the planned rates were used as actuals, check them');
  }

  return {
    places: rPlaces.map((pl) => ({ id: pl.id, name: pl.name || '' })),
    people,
    items: [...rows.filter((r) => !replaced(r)).map(toItem), ...housing],
  };
}
