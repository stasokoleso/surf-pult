import { html } from './html.js';
import { useState } from '../vendor/hooks.js';
import { calcCamp, countedResult, priceForTarget, withStudentCount } from '../core/calc.js';
import { blankFacts, copyPlanToFact, factsOf, setField, withFacts } from '../core/edit.js';
import { STATUSES, dayRate } from '../core/model.js';
import { Anatomy } from './Anatomy.js';
import { Contract } from './Contract.js';
import { NumberField } from './fields.js';
import { Roster } from './Roster.js';
import { WhatIf } from './WhatIf.js';
import { dateRange, money, plural } from './format.js';
import { camps, deleteCamp, showToast, updateCamp } from './state.js';

export function CampPage({ id }) {
  // План или факт, «факт поверх плана» и примерка «если группа другая» — вид экрана, а не правка:
  // в базу не пишутся и не переезжают на другой кемп.
  const [view, setView] = useState({ id: null });
  const camp = camps.value.find((c) => c.id === id);
  if (!camp) {
    return html`
      <div class="camp">
        <a class="back" href="#/">‹ Camps</a>
        <div class="empty"><h2>This camp is gone</h2><p>It may have been deleted. Pick another one from the list.</p></div>
      </div>`;
  }

  const own = view.id === camp.id ? view : { id: camp.id, sc: null, overlay: false, n: null, tab: 'numbers' };
  const patchView = (patch) => setView({ ...own, ...patch });
  // Пока режим не выбран — как в итогах списка: у проведённого кемпа с фактом факт, иначе план.
  const sc = own.sc ?? countedResult(camp).scenario;
  const real = calcCamp(camp, sc);
  const actual = real.studentCount;
  const trial = own.n !== null && own.n !== actual ? withStudentCount(camp, own.n) : null;
  // Метрики, анатомия и водопад примеряют другое число учеников; поля и лента состава — настоящие.
  const r = trial ? calcCamp(trial, sc) : real;
  const plan = own.overlay ? calcCamp(trial ?? camp, 'plan') : null;
  const pickCount = (n) => patchView({ n: n === actual ? null : n });
  const setScenario = (next) => patchView({ sc: next, overlay: next === 'fact' && own.overlay });
  // Факт поверх плана — это экран факта, поэтому переключатель сразу показывает Fact.
  const toggleOverlay = () => patchView({ overlay: !own.overlay, sc: own.overlay ? sc : 'fact' });
  // Новый раздел — с начала: иначе на телефоне попадаешь в середину чужой прокрутки.
  const pickTab = (tab) => {
    patchView({ tab });
    scrollTo({ top: 0 });
  };

  const cur = camp.currency;
  const edit = (change) => updateCamp(camp.id, change);
  const set = (field) => (v) => edit((c) => setField(c, field, v));
  const setStudents = (n) => {
    if (!edit((c) => setField(c, 'students', n))) showToast('Can’t remove more: the other students have their own dates.');
  };
  const blanks = sc === 'fact' ? blankFacts(camp) : [];
  const names = blanks.map((b) => b.name);
  const listed = names.length > 4 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  const fillFromPlan = () => {
    const before = factsOf(camp);
    if (!edit(copyPlanToFact)) return;
    showToast(`Filled ${plural(blanks.length, 'amount')} from the plan`, { label: 'Undo', run: () => edit((c) => withFacts(c, before)) });
  };
  const facts = [dateRange(camp.startDate, real.days) || 'No date', plural(real.days, 'day'), plural(camp.nights, 'night'), plural(actual, 'student')];

  return html`
    <article class="camp" data-tab=${own.tab}>
      <a class="back" href="#/">‹ Camps</a>
      <header class="camp-top">
        <div class="camp-head">
          <div class="eyebrow">${facts.join(' · ')}</div>
          <input class="camp-name" value=${camp.name} placeholder="Untitled camp" aria-label="Camp name" autocomplete="off"
            onInput=${(e) => { const name = e.currentTarget.value; edit((c) => ({ ...c, name })); }} />
        </div>
        <div class="camp-ctl">
          <div class="seg" role="group" aria-label="Status">
            ${Object.entries(STATUSES).map(([key, label]) => html`
              <button type="button" aria-pressed=${camp.status === key} onClick=${() => edit((c) => ({ ...c, status: key }))}>${label}</button>`)}
          </div>
          <div class="seg" role="group" aria-label="Numbers">
            <button type="button" aria-pressed=${sc === 'plan'} onClick=${() => setScenario('plan')}>Plan</button>
            <button type="button" aria-pressed=${sc === 'fact'} onClick=${() => setScenario('fact')}>Fact</button>
          </div>
          <button type="button" class="tog" aria-pressed=${own.overlay} onClick=${toggleOverlay}><i></i>Fact over plan</button>
        </div>
      </header>

      <div class="pane" data-pane="numbers">
        <section class="setup" aria-label="Camp setup">
          <label class="fld fld-date">
            <span class="fld-l">Start</span>
            <span class="fld-box"><input type="date" value=${camp.startDate}
              onChange=${(e) => { const startDate = e.currentTarget.value; edit((c) => ({ ...c, startDate })); }} /></span>
          </label>
          <${NumberField} label="Days" value=${camp.days} onCommit=${set('days')} />
          <${NumberField} label="Nights" value=${camp.nights} onCommit=${set('nights')} />
          <${NumberField} label="Sessions" value=${camp.sessions} onCommit=${set('sessions')} />
          <${NumberField} label="Students" value=${actual} onCommit=${setStudents} />
          ${sc === 'fact'
            ? html`<${NumberField} label="Actual price" value=${camp.price.fact} live prefix=${cur}
                hint=${`Plan ${money(camp.price.plan, cur)}`} onCommit=${set('priceFact')} />`
            : html`<${NumberField} label="Seat price" value=${camp.price.plan} live prefix=${cur}
                hint=${`${money(dayRate(camp), cur)} / day`} onCommit=${set('price')} />`}
          <${NumberField} label="Reserve" value=${camp.reservePct} live suffix="%" onCommit=${set('reservePct')} />
          <${NumberField} label="Target take" value=${camp.target > 0 ? camp.target : null} live clearable prefix=${cur}
            hint=${targetHint(real, camp.target, cur)} onCommit=${set('target')} />
        </section>
        <div class="hold">
          <span>When the length changes, keep the</span>
          <div class="seg" role="group" aria-label="What to keep when the length changes">
            <button type="button" aria-pressed=${camp.price.hold === 'total'}
              onClick=${() => edit((c) => ({ ...c, price: { ...c.price, hold: 'total' } }))}>Seat price</button>
            <button type="button" aria-pressed=${camp.price.hold === 'rate'}
              onClick=${() => edit((c) => ({ ...c, price: { ...c.price, hold: 'rate' } }))}>Day rate</button>
          </div>
          <label class="fld-inline">
            <span>Currency</span>
            <span class="fld-box"><input value=${cur} maxlength="3" autocomplete="off"
              onInput=${(e) => { const currency = e.currentTarget.value; edit((c) => ({ ...c, currency })); }} /></span>
          </label>
        </div>

        ${blanks.length > 0 && html`
          <div class="whatif" role="status">
            <span>${real.hasFact
              ? `Still zero in actuals: ${listed}. If they went as planned, fill them from the plan.`
              : 'No actuals yet, so every amount counts as zero. Start from the plan and fix what changed.'}</span>
            <button type="button" class="quiet" onClick=${fillFromPlan}>${real.hasFact ? 'Fill from plan' : 'Copy plan to actuals'}</button>
          </div>`}
        ${trial && html`
          <div class="whatif" role="status">
            <span>What if: ${plural(own.n, 'student')} instead of ${actual}. The numbers below use this; the roster stays as it is.</span>
            <button type="button" class="quiet" onClick=${() => pickCount(actual)}>Reset</button>
          </div>`}
        <${Metrics} r=${r} cur=${cur} />
        <${Anatomy} key=${camp.id} camp=${camp} r=${r} plan=${plan} edit=${edit} />
        <div class="pair">
          <${WhatIf} camp=${camp} scenario=${sc} n=${trial ? own.n : actual} onPick=${pickCount} />
          <${Contract} r=${r} cur=${cur} reservePct=${camp.reservePct} />
        </div>
      </div>

      <div class="pane" data-pane="people">
        <${Roster} key=${camp.id} camp=${camp} r=${real} edit=${edit} />
      </div>

      <div class="pane" data-pane="notes">
        <section class="camp-notes">
          <div class="kicker" id="notes-title">Notes</div>
          <textarea value=${camp.notes} rows="6" placeholder="Anything to remember about this camp" aria-labelledby="notes-title"
            onInput=${(e) => { const notes = e.currentTarget.value; edit((c) => ({ ...c, notes })); }}></textarea>
        </section>

        <footer class="camp-foot">
          <button type="button" class="quiet" onClick=${() => deleteCamp(camp.id)}>Delete camp</button>
        </footer>
      </div>

      <${Tabbar} tab=${own.tab} onPick=${pickTab} />
    </article>`;
}

const TABS = [
  ['numbers', 'Numbers', html`<path d="M5 18v-7M11 18V5M17 18v-9" />`],
  ['people', 'People', html`<circle cx="8" cy="8" r="3" /><circle cx="15.5" cy="9" r="2.3" /><path d="M3 18c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5M14 13.7c2.3-.4 4.2.9 5 4.3" />`],
  ['notes', 'Notes', html`<path d="M6 4h7l3 3v11H6zM9 10h4M9 14h4" />`],
];

// На телефоне кемп — три раздела под большим пальцем. На широком окне всё видно сразу, и полосы нет.
function Tabbar({ tab, onPick }) {
  return html`
    <nav class="tabbar" aria-label="Camp sections">
      ${TABS.map(([key, label, icon]) => html`
        <button type="button" class="tab" key=${key} aria-pressed=${tab === key} onClick=${() => onPick(key)}>
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${icon}</svg>
          ${label}
        </button>`)}
    </nav>`;
}

// Цена под заработок считается по настоящему составу: поле стоит выше примерки «если группа другая».
function targetHint(r, target, cur) {
  if (!(target > 0)) return 'Shows the seat price you need';
  const t = priceForTarget(r, target);
  if (!Number.isFinite(t.need)) return 'Everyone pays their own price';
  if (t.need <= 0) return 'Reached even with free seats';
  const d = Math.round(t.diff);
  return `Seat ${money(t.need, cur)}${d === 0 ? ', as now' : ` (${d > 0 ? '+' : '−'}${money(Math.abs(d), cur)})`}`;
}

function Metrics({ r, cur }) {
  const perDay = (v) => `${money(v / r.days, cur)} / day`;
  const cell = (label, value, detail) => html`
    <div class="m"><span class="l">${label}</span><span class="v">${money(value, cur)}</span><span class="d">${detail}</span></div>`;
  return html`
    <div class="metrics">
      <div class="m hero">
        <span class="l">Your take</span>
        <span class="v">${money(r.mine.take, cur)}</span>
        <span class="d">profit ${money(r.totals.profit, cur)} + your own work ${money(r.mine.fee, cur)}</span>
      </div>
      ${cell('Seat price', r.seat.price, perDay(r.seat.price))}
      ${cell('Seat cost', r.seat.cost, `${perDay(r.seat.cost)} · with reserve`)}
      ${cell('Break-even', r.seat.breakeven, `${perDay(r.seat.breakeven)} · with my costs`)}
      ${cell('Profit', r.totals.profit, Number.isFinite(r.margin) ? `${Math.round(r.margin)}% margin` : 'no revenue yet')}
    </div>`;
}
