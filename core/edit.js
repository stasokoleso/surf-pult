// Правка параметров кемпа: экран передаёт поле и число, связи между полями живут здесь.
import { withStudentCount } from './calc.js';
import { daysForNights, makePerson, newId, nightsForDays, num, setLength, staysLike } from './model.js';

// null — правку применить нельзя (например, столько учеников на весь кемп не убрать).
export function setField(camp, field, value) {
  switch (field) {
    case 'days': return setLength(camp, Math.round(value), nightsForDays(value));
    case 'nights': return setLength(camp, daysForNights(value), Math.round(value));
    case 'sessions': return { ...camp, sessions: Math.max(0, Math.round(value)) };
    case 'students': return withStudentCount(camp, Math.max(0, Math.round(value)));
    case 'price': return { ...camp, price: { ...camp.price, plan: Math.max(0, value) } };
    case 'priceFact': return { ...camp, price: { ...camp.price, fact: Math.max(0, value) } };
    case 'reservePct': return { ...camp, reservePct: Math.max(0, value) };
    case 'target': return { ...camp, target: Math.max(0, value ?? 0) };
    default: throw new Error(`Unknown field: ${field}`);
  }
}

/* ---------- факт ----------
   Пустой факт — ноль, и статья по факту выходит бесплатной, а без цены — вся выручка.
   Поэтому пустые суммы показываем списком и даём заполнить их из плана; введённое не трогаем. */
const isBlank = (x) => num(x.fact) === 0 && num(x.plan) !== 0;

export const blankFacts = (camp) => [
  ...(isBlank(camp.price) ? [{ id: 'price', name: 'seat price' }] : []),
  ...camp.items.filter(isBlank).map((i) => ({ id: i.id, name: i.name.trim() || 'Untitled item' })),
];

// null — заполнять нечего.
export function copyPlanToFact(camp) {
  if (!blankFacts(camp).length) return null;
  const fill = (x) => (isBlank(x) ? { ...x, fact: x.plan } : x);
  return { ...camp, price: fill(camp.price), items: camp.items.map(fill) };
}

export const factsOf = (camp) => ({
  price: camp.price.fact,
  items: Object.fromEntries(camp.items.map((i) => [i.id, i.fact])),
});

// «Вернуть» после копирования: факт как был; статьи, добавленные уже после, не трогаем.
export const withFacts = (camp, facts) => ({
  ...camp,
  price: { ...camp.price, fact: facts.price },
  items: camp.items.map((i) => (i.id in facts.items ? { ...i, fact: facts.items[i.id] } : i)),
});

/* ---------- статьи ----------
   Ограничения статьи (у личных расходов нет «моего подряда», место бывает только у ночной)
   наводит normalizeCamp внутри updateCamp — здесь их не дублируем. */

export const blankItem = (split) => ({ id: newId(), name: '', unit: 'once', split, mine: false, placeId: null, plan: 0, fact: 0 });

export function patchItem(camp, id, patch) {
  const clean = { ...patch };
  for (const key of ['plan', 'fact']) if (key in clean) clean[key] = Math.max(0, clean[key]);
  return { ...camp, items: camp.items.map((i) => (i.id === id ? { ...i, ...clean } : i)) };
}

// Удаление и «Вернуть» на прежнее место — одинаково для статей и людей.
// null от вставки — запись уже на месте: второе нажатие Undo не должно её удвоить.
const removeFrom = (key) => (camp, id) =>
  (camp[key].some((x) => x.id === id) ? { ...camp, [key]: camp[key].filter((x) => x.id !== id) } : null);

const insertInto = (key) => (camp, entry, index) => {
  if (camp[key].some((x) => x.id === entry.id)) return null;
  const list = [...camp[key]];
  list.splice(Math.min(Math.max(0, index), list.length), 0, entry);
  return { ...camp, [key]: list };
};

export const removeItem = removeFrom('items');
export const insertItem = insertInto('items');

/* ---------- люди ---------- */

export const removePerson = removeFrom('people');
export const insertPerson = insertInto('people');

export function patchPerson(camp, id, patch) {
  if (!camp.people.some((p) => p.id === id)) return null;
  const clean = { ...patch };
  if ('price' in clean && clean.price !== null) clean.price = Math.max(0, clean.price);
  return { ...camp, people: camp.people.map((p) => (p.id === id ? { ...p, ...clean } : p)) };
}

/* Сдвиг приезда (end = 'from') или отъезда ('to') на день кемпа. Приезд не позже отъезда, оба — внутри кемпа.
   Весь кемп храним как null/null: так человек считается ночами кемпа, как ученик ровного состава.
   null — даты не изменились, записывать нечего. */
export function setPersonDay(camp, id, end, day) {
  const person = camp.people.find((p) => p.id === id);
  if (!person) return null;
  const D = camp.days;
  const clamp = (v, lo, hi) => Math.min(Math.max(Math.round(v), lo), hi);
  let from = Math.min(person.from ?? 1, D);
  let to = Math.min(person.to ?? D, D);
  if (end === 'from') from = clamp(day, 1, to);
  else to = clamp(day, from, D);
  const next = from === 1 && to === D ? { from: null, to: null } : { from, to };
  if (next.from === person.from && next.to === person.to) return null;
  // В v1 у человека одно место, и оно идёт за его датами. Несколько отрезков — это переезды, их не трогаем.
  const stays = person.stays.length === 1 ? [{ ...person.stays[0], from: null, to: null }] : person.stays;
  return patchPerson(camp, id, { ...next, stays });
}

export const setPersonPlace = (camp, id, placeId) =>
  patchPerson(camp, id, { stays: placeId ? [{ placeId, from: null, to: null }] : [] });

// Новый человек — на весь кемп и в том же жилье, что последний с той же ролью: обычно так и есть.
export function newPerson(camp, role) {
  const same = camp.people.filter((p) => p.role === role);
  const name = role === 'student' ? `Student ${same.length + 1}` : role === 'me' ? 'Me' : '';
  return makePerson({ name, role, stays: staysLike(same[same.length - 1]) });
}

/* ---------- жильё ----------
   Место и его ночная статья создаются парой: цена живёт в статье, а люди ссылаются на место. */

export function newPlace() {
  const id = newId();
  return {
    place: { id, name: '' },
    item: { id: newId(), name: 'Housing', unit: 'night', split: 'perStudent', mine: false, placeId: id, plan: 0, fact: 0 },
  };
}

export const addPlace = (camp, { place, item }) =>
  ({ ...camp, places: [...camp.places, place], items: [...camp.items, item] });
