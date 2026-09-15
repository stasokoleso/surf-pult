import { html } from './html.js';
import { useRef, useState } from '../vendor/hooks.js';
import {
  addPlace, insertPerson, newPerson, newPlace, patchPerson, removePerson, setPersonDay, setPersonPlace,
} from '../core/edit.js';
import { ROLES, dateOfDay } from '../core/model.js';
import { NumberField } from './fields.js';
import { money, plural } from './format.js';
import { showToast } from './state.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Цвет полосы — куда уходят расходы человека: ученик — в своё место, персонал — в общие, я — в мои.
const ROLE_KIND = { student: 'student', staff: 'shared', me: 'personal' };
const ROLE_NOTE = { staff: 'in shared costs', me: 'in my costs' };

const personName = (p) => p.name.trim() || ROLES[p.role];

function dayLabel(startDate, n) {
  const iso = startDate ? dateOfDay(startDate, n) : null;
  if (!iso) return { num: n, week: '' };
  const d = new Date(`${iso}T00:00:00Z`);
  return { num: d.getUTCDate(), week: WEEKDAYS[d.getUTCDay()] };
}

function dayText(startDate, n) {
  const l = dayLabel(startDate, n);
  return l.week ? `Day ${n} · ${l.week} ${l.num}` : `Day ${n}`;
}

// В шапке ленты — две буквы: у кемпа на три недели колонка дня уже слова «Mon».
const shortWeek = (week) => week.slice(0, 2);

/* Лента «кто когда в кемпе»: сверху — сколько учеников на месте в каждый день, ниже — полоса каждого человека.
   Концы полосы тянутся, и все цифры страницы пересчитываются на ходу. */
export function Roster({ camp, r, edit }) {
  const [sel, setSel] = useState(null);
  const drag = useRef(null);
  const D = r.days;
  const cur = camp.currency;
  const span = (p) => {
    const to = Math.min(p.to ?? D, D);
    return { from: Math.min(p.from ?? 1, to), to };
  };
  const students = camp.people.filter((p) => p.role === 'student');
  const counts = Array.from({ length: D }, (_, i) => students.filter((p) => span(p).from <= i + 1 && span(p).to >= i + 1).length);
  const peak = Math.max(0, ...counts);
  const rows = new Map(r.students.map((s) => [s.id, s]));

  const add = (role) => {
    const p = newPerson(camp, role);
    if (edit((c) => insertPerson(c, p, c.people.length))) setSel(p.id);
  };
  const remove = (p) => {
    const index = camp.people.indexOf(p);
    if (!edit((c) => removePerson(c, p.id))) return;
    setSel(null);
    showToast(`Removed “${personName(p)}”`, { label: 'Undo', run: () => edit((c) => insertPerson(c, p, index)) });
  };

  // День считаем по месту пальца на дорожке, а границы (приезд не позже отъезда) держит setPersonDay.
  const onDown = (id, end) => (e) => {
    drag.current = { id, end, track: e.currentTarget.closest('.r-track') };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    setSel(id);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const box = d.track.getBoundingClientRect();
    const x = Math.round((e.clientX - box.left) / box.width * D);
    edit((c) => setPersonDay(c, d.id, d.end, d.end === 'from' ? x + 1 : x));
  };
  const onUp = () => { drag.current = null; };
  const onKey = (id, end, value) => (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    edit((c) => setPersonDay(c, id, end, value + step));
  };

  const personRow = (p) => {
    const s = span(p);
    const row = rows.get(p.id);
    const handle = (end, value, label) => html`
      <span class=${`r-h r-${end}`} role="slider" tabindex="0" aria-label=${`${label}: ${personName(p)}`}
        aria-valuemin="1" aria-valuemax=${D} aria-valuenow=${value} aria-valuetext=${dayText(camp.startDate, value)}
        onPointerDown=${onDown(p.id, end)} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}
        onKeyDown=${onKey(p.id, end, value)}></span>`;
    return html`
      <div class="rr" key=${p.id} aria-current=${sel === p.id}>
        <button type="button" class="r-name" aria-expanded=${sel === p.id} onClick=${() => setSel(sel === p.id ? null : p.id)}>
          ${personName(p)}${p.role !== 'student' && html`<small>${ROLES[p.role]}</small>`}
        </button>
        <span class="r-track">
          <span class=${`r-bar k-${ROLE_KIND[p.role]}`}
            style=${{ left: `${(s.from - 1) / D * 100}%`, width: `${(s.to - s.from + 1) / D * 100}%` }}>
            ${handle('from', s.from, 'Arrives')}${handle('to', s.to, 'Leaves')}
          </span>
        </span>
        ${row
          ? html`<span class="r-days">${row.days}</span><span class="r-cost">${money(row.cost, cur)}</span>
            <span class=${`r-profit${row.profit < 0 ? ' loss' : ''}`}>${money(row.profit, cur)}</span>`
          : html`<span class="r-note">${ROLE_NOTE[p.role]}</span>`}
      </div>`;
  };

  return html`
    <section class="roster" aria-labelledby="roster-title">
      <div class="kicker">Roster by day</div>
      <${Headline} r=${r} counts=${counts} peak=${peak} total=${students.length} />
      <div class="rtab" style=${{ '--days': D }}>
        <div class="rr r-band" aria-hidden="true">
          <span class="r-name">Students<small>on site</small></span>
          <span class="r-counts">${counts.map((c) => html`
            <span><i class="k-student" style=${{ height: `${peak ? c / peak * 100 : 0}%` }}></i><b>${c}</b></span>`)}</span>
        </div>
        <div class="rr r-head" aria-hidden="true">
          <span class="r-name">${camp.startDate ? '' : 'Day'}</span>
          <span class="r-dates">${counts.map((_, i) => {
            const l = dayLabel(camp.startDate, i + 1);
            return html`<span><b>${l.num}</b>${l.week && html`<small>${shortWeek(l.week)}</small>`}</span>`;
          })}</span>
          <span class="r-days">Days</span><span class="r-cost">Cost</span>
          <span class="r-profit">Profit<small>before my costs</small></span>
        </div>
        ${camp.people.map((p) => [
          personRow(p),
          sel === p.id && html`<${PersonEditor} key=${`${p.id}-ed`} camp=${camp} person=${p} row=${rows.get(p.id)}
            edit=${edit} onClose=${() => setSel(null)} onRemove=${() => remove(p)} />`,
        ])}
      </div>
      <div class="r-add">
        <button type="button" class="t-add" onClick=${() => add('student')}>+ Student</button>
        <button type="button" class="t-add" onClick=${() => add('staff')}>+ Staff</button>
        ${!camp.people.some((p) => p.role === 'me') && html`<button type="button" class="t-add" onClick=${() => add('me')}>+ Me</button>`}
      </div>
    </section>`;
}

function Headline({ r, counts, peak, total }) {
  if (!total) {
    return html`
      <h2 class="bt" id="roster-title">No students yet</h2>
      <p class="bs">Add students to see who is on site on each day.</p>`;
  }
  const busy = counts.map((c, i) => (c === peak ? i + 1 : 0)).filter(Boolean);
  const first = busy[0];
  const last = busy[busy.length - 1];
  const when = busy.length === r.days ? 'for the whole camp'
    : busy.length === 1 ? `on day ${first}`
      : last - first + 1 === busy.length ? `on days ${first}–${last}` : `on ${busy.length} of ${r.days} days`;
  const who = peak < total ? `Up to ${peak} of ${total} students are` : total === 1 ? 'The student is' : `All ${total} students are`;
  const seats = Math.round(r.equiv * 10) / 10;
  return html`
    <h2 class="bt" id="roster-title">${who} on site ${when}</h2>
    <p class="bs">${plural(r.studentDays, 'student-day')} make ${plural(seats, 'full seat')}. Drag the ends of a bar, or pick a name to change dates, housing and price.</p>`;
}

function PersonEditor({ camp, person: p, row, edit, onClose, onRemove }) {
  const D = camp.days;
  const cur = camp.currency;
  const to = Math.min(p.to ?? D, D);
  const from = Math.min(p.from ?? 1, to);
  const patch = (x) => edit((c) => patchPerson(c, p.id, x));
  const day = (end, v) => edit((c) => setPersonDay(c, p.id, end, v));
  const otherMe = camp.people.some((x) => x.role === 'me' && x.id !== p.id);

  // В списке — места со статьёй жилья: цена ночи живёт в статье, без неё выбирать нечего.
  const places = [...new Map(camp.items.filter((i) => i.placeId).map((i) => [i.placeId, i.name.trim() || 'Untitled housing'])).entries()];
  const moves = p.stays.length > 1;
  const current = p.stays[0]?.placeId ?? '';
  const pickPlace = (value) => {
    if (value !== 'new') {
      edit((c) => setPersonPlace(c, p.id, value || null));
      return;
    }
    const pair = newPlace();
    if (edit((c) => setPersonPlace(addPlace(c, pair), p.id, pair.place.id))) {
      showToast('Added “Housing”. Set its nightly rate under Housing in the price anatomy.');
    }
  };

  const stepper = (label, end, value, lo, hi) => html`
    <div class="fld ied-step">
      <span class="fld-l">${label}</span>
      <div class="step">
        <button type="button" aria-label=${`${label} a day earlier`} disabled=${value <= lo} onClick=${() => day(end, value - 1)}>−</button>
        <output>${dayText(camp.startDate, value)}</output>
        <button type="button" aria-label=${`${label} a day later`} disabled=${value >= hi} onClick=${() => day(end, value + 1)}>+</button>
      </div>
    </div>`;

  const note = row
    ? `Costs ${money(row.cost, cur)} · pays ${money(row.revenue, cur)} · ${row.profit >= 0 ? 'profit' : 'loss'} before my costs ${money(Math.abs(row.profit), cur)}`
    : p.role === 'staff' ? 'Staff housing is part of the shared costs.' : 'Your housing counts as my costs.';

  return html`
    <div class="ied">
      <label class="fld ied-name">
        <span class="fld-l">Name</span>
        <span class="fld-box"><input value=${p.name} placeholder=${ROLES[p.role]} autocomplete="off"
          onInput=${(e) => patch({ name: e.currentTarget.value })} /></span>
      </label>
      <div class="fld ied-split">
        <span class="fld-l">Role</span>
        <div class="seg" role="group" aria-label="Role">
          ${Object.entries(ROLES).map(([k, l]) => html`
            <button type="button" aria-pressed=${p.role === k} disabled=${k === 'me' && otherMe} onClick=${() => patch({ role: k })}>${l}</button>`)}
        </div>
      </div>
      ${stepper('Arrives', 'from', from, 1, to)}
      ${stepper('Leaves', 'to', to, from, D)}
      <label class="fld">
        <span class="fld-l">Stays at</span>
        <span class="fld-box">${moves
          ? html`<select disabled><option>Moves between places</option></select>`
          : html`<select value=${current} onChange=${(e) => pickPlace(e.currentTarget.value)}>
            <option value="">No housing</option>
            ${places.map(([id, name]) => html`<option value=${id}>${name}</option>`)}
            ${current && !places.some(([id]) => id === current) && html`<option value=${current}>Unpriced place</option>`}
            <option value="new">New place…</option>
          </select>`}</span>
      </label>
      ${p.role === 'student' && html`
        <${NumberField} label="Pays" value=${p.price} clearable prefix=${cur}
          placeholder=${String(Math.round(camp.price.plan / D * (to - from + 1)))} hint="Empty: the camp price"
          onCommit=${(v) => patch({ price: v })} />`}
      <p class="ied-note">${note}</p>
      <div class="ied-foot">
        <button type="button" class="quiet" onClick=${onRemove}>Remove person</button>
        <button type="button" class="quiet" onClick=${onClose}>Done</button>
      </div>
    </div>`;
}
