import { html } from './html.js';
import { useLayoutEffect, useRef, useState } from '../vendor/hooks.js';
import { GROUPS, priceAnatomy, rowKey, seatsByRow } from '../core/anatomy.js';
import { blankItem, insertItem, patchItem, removeItem } from '../core/edit.js';
import { UNITS } from '../core/model.js';
import { NumberField } from './fields.js';
import { money, plural } from './format.js';
import { showToast } from './state.js';

const SPLIT_LABELS = { perStudent: 'Per student', shared: 'Shared', personal: 'My own' };
// Какую статью создаёт «Add item» в группе. У жилья кнопки нет: места появятся вместе с составом.
const GROUP_SPLIT = { student: 'perStudent', shared: 'shared', personal: 'personal' };
const WORD = { night: 'night', day: 'day', session: 'session' };

const itemName = (item) => item.name.trim() || 'Untitled item';

// Ставку показываем с центами, если они есть: иначе «€12 × 9 nights» не сходится с итогом €113.
function rateText(v, cur) {
  if (Number.isInteger(Math.round(v * 100) / 100)) return money(v, cur);
  return `${cur}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qtyText({ item, quantity }, cur) {
  const q = Math.round(quantity * 100) / 100;
  const rate = rateText(item.rate, cur);
  if (item.unit === 'once' && item.split !== 'perStudent' && q === 1) return `${rate} one-off`;
  const word = item.unit !== 'once' ? WORD[item.unit] : item.split === 'perStudent' ? 'student' : 'time';
  return `${rate} × ${plural(q, word)}`;
}

// plan — расчёт по плану для «факт поверх плана»; null — обычные полосы.
export function Anatomy({ camp, r, plan = null, edit }) {
  const [open, setOpen] = useState(null);
  const [fresh, setFresh] = useState(null);
  const a = priceAnatomy(r);
  const planSeats = plan ? seatsByRow(priceAnatomy(plan)) : null;
  const cur = camp.currency;
  const perDay = (seat) => money(seat / r.days, cur);

  // Полосы в строках — в одном масштабе: самая дорогая статья на место занимает всю ширину.
  // С планом под фактом в масштаб входит и план, иначе бледная полоса вылезла бы за край.
  const lines = [...a.groups.flatMap((g) => g.rows), a.reserve, ...a.personal.rows];
  const maxSeat = Math.max(0, ...[...lines.map((x) => x.seat), ...(planSeats ? planSeats.values() : [])].filter(Number.isFinite));
  const width = (v) => `${Math.max(0, v) / maxSeat * 100}%`;
  const bar = (seat, k, hatch = false, key = null) => {
    const cls = `k-${k}${hatch ? ' hatch' : ''}`;
    const was = planSeats && key ? planSeats.get(key) : undefined;
    if (Number.isFinite(was) && Number.isFinite(seat)) {
      const d = Math.round(seat - was);
      return html`<span class="t-bar ov">
        <span class="ov-track">${maxSeat > 0 && html`<span class=${`ov-plan ${cls}`} style=${{ width: width(was) }}></span><span
          class=${`ov-fact ${cls}`} style=${{ width: width(seat) }}></span>`}</span>
        <small class="ov-d">${d === 0 ? '' : `${d > 0 ? '+' : '−'}${money(Math.abs(d), cur)}`}</small>
      </span>`;
    }
    return html`<span class="t-bar">${maxSeat > 0 && seat > 0 && html`<span class=${cls} style=${{ width: width(seat) }}></span>`}</span>`;
  };

  const add = (key) => {
    const item = blankItem(GROUP_SPLIT[key]);
    if (!edit((c) => insertItem(c, item, c.items.length))) return;
    setOpen(item.id);
    setFresh(item.id);
  };
  const remove = (id) => {
    const item = camp.items.find((i) => i.id === id);
    const index = camp.items.indexOf(item);
    if (!item || !edit((c) => removeItem(c, id))) return;
    setOpen(null);
    showToast(`Deleted “${itemName(item)}”`, { label: 'Undo', run: () => edit((c) => insertItem(c, item, index)) });
  };

  const itemRow = (row, k) => {
    const { item } = row;
    const cells = html`
      <span class="t-name">${row.myNights ? `${itemName(item)}, my nights` : itemName(item)}${item.mine && !row.myNights && html`<span class="mine">yours</span>`}</span>
      <span class="t-qty">${qtyText(row, cur)}</span>
      <span class="num t-camp">${money(row.total, cur)}</span>
      <span class="num t-seat">${money(row.seat, cur)}</span>
      <span class="num t-day">${perDay(row.seat)}</span>
      ${bar(row.seat, k, item.mine && !row.myNights, rowKey(row))}`;
    // Строка «мои ночи» — вторая половина статьи жилья; правится в самой статье.
    if (row.myNights) return html`<div class="tr" key=${rowKey(row)}>${cells}</div>`;
    const isOpen = open === item.id;
    return [
      html`<button type="button" class="tr ti" key=${item.id} aria-expanded=${isOpen}
        onClick=${() => setOpen(isOpen ? null : item.id)}>${cells}</button>`,
      isOpen && html`<${ItemEditor} key=${`${item.id}-ed`} item=${camp.items.find((i) => i.id === item.id)}
        scenario=${r.scenario} cur=${cur} fresh=${fresh === item.id}
        onPatch=${(p) => edit((c) => patchItem(c, item.id, p))} onClose=${() => setOpen(null)} onRemove=${() => remove(item.id)} />`,
    ];
  };

  const groupBlock = (g) => [
    html`<div class="tr tg" key=${g.key}>
      <span class="t-name"><i class=${`sw k-${g.key}`}></i>${GROUPS[g.key]}</span><span class="t-qty"></span>
      <span class="num t-camp">${money(g.total, cur)}</span><span class="num t-seat">${money(g.seat, cur)}</span>
      <span class="num t-day">${perDay(g.seat)}</span><span class="t-bar"></span>
    </div>`,
    ...g.rows.map((row) => itemRow(row, g.key)),
    GROUP_SPLIT[g.key] && html`<button type="button" class="t-add" key=${`${g.key}-add`} onClick=${() => add(g.key)}>+ Add item</button>`,
  ];

  const line = (cls, name, qty, x, k) => html`
    <div class=${`tr ${cls}`}>
      <span class="t-name">${name}</span><span class="t-qty">${qty}</span>
      <span class="num t-camp">${money(x.total, cur)}</span><span class="num t-seat">${money(x.seat, cur)}</span>
      <span class="num t-day">${perDay(x.seat)}</span>${k ? bar(x.seat, k, false, k) : html`<span class="t-bar"></span>`}
    </div>`;

  const mode = planSeats ? ' · fact over plan' : r.scenario === 'fact' ? ' · actuals' : '';
  return html`
    <section class="anatomy" aria-labelledby="anatomy-title">
      <div class="kicker">Price anatomy${mode}</div>
      <${Headline} a=${a} r=${r} cur=${cur} />
      <${Strip} a=${a} cur=${cur} />
      <div class="tbl">
        <div class="tr th" aria-hidden="true">
          <span>Item</span><span>Rate × quantity</span><span class="num">Camp</span>
          <span class="num">Per seat</span><span class="num">Per day</span><span>${planSeats ? 'Plan, fact on top' : 'Share of the seat'}</span>
        </div>
        ${a.groups.filter((g) => g.key !== 'housing' || g.rows.length).map(groupBlock)}
        ${line('', `Reserve ${camp.reservePct}%`, 'on all items above', a.reserve, 'reserve')}
        ${line('tt strong', 'Seat cost', 'items + reserve', a.seatCost)}
        ${groupBlock(a.personal)}
        ${line('tt strong', 'Break-even', 'seat cost + my costs', a.breakeven)}
        ${line('tt', 'Revenue', `seat price ${money(r.seat.price, cur)}`, a.revenue)}
        ${line('tp', 'Profit', Number.isFinite(r.margin) ? `${Math.round(r.margin)}% margin` : 'no revenue yet', a.profit)}
      </div>
    </section>`;
}

function Headline({ a, r, cur }) {
  if (!(r.equiv > 0)) {
    return html`
      <h2 class="bt" id="anatomy-title">No students yet</h2>
      <p class="bs">Add students to see what one seat costs and what is left of its price.</p>`;
  }
  const profit = a.profit.seat;
  const seats = Math.round(r.equiv * 10) / 10;
  return html`
    <h2 class="bt" id="anatomy-title">${profit >= 0
      ? `Of every ${money(a.revenue.seat, cur)} seat, ${money(profit, cur)} is profit`
      : `Each seat loses ${money(-profit, cur)}`}</h2>
    <p class="bs">One seat is one student for all ${plural(r.days, 'day')}. Shared costs are split by days on site: ${plural(seats, 'full seat')} this camp.</p>`;
}

function Strip({ a, cur }) {
  const price = a.revenue.seat;
  const cost = a.breakeven.seat;
  const scale = Math.max(price, cost);
  if (!(scale > 0)) return null;
  const parts = [
    ...a.groups.map((g) => [g.key, GROUPS[g.key], g.seat]),
    ['reserve', 'Reserve', a.reserve.seat],
    ['personal', GROUPS.personal, a.personal.seat],
  ].filter(([, , v]) => v > 0);
  const profit = price - cost;
  const pct = (v) => `${v / scale * 100}%`;
  const result = `${profit >= 0 ? 'Profit' : 'Loss'} ${money(Math.abs(profit), cur)}`;
  return html`
    <figure class="strip">
      <div class="strip-bar" role="img" aria-label=${`One seat: ${parts.map(([, l, v]) => `${l} ${money(v, cur)}`).join(', ')}. ${result}.`}>
        ${parts.map(([k, , v]) => html`<span class=${`k-${k}`} style=${{ width: pct(v) }}></span>`)}
        ${profit > 0 && html`<span class="k-profit" style=${{ width: pct(profit) }}></span>`}
        <i class="strip-price" style=${{ left: pct(price) }}></i>
        <small class=${`strip-price-l${price / scale < 0.3 ? ' start' : ''}`} style=${{ left: pct(price) }}>Price ${money(price, cur)}</small>
      </div>
      <figcaption class="strip-key">
        ${parts.map(([k, l, v]) => html`<span><i class=${`sw k-${k}`}></i>${l} <b>${money(v, cur)}</b></span>`)}
        <span class=${`strip-end ${profit >= 0 ? 'gain' : 'loss'}`}>${profit >= 0 ? 'Profit' : 'Loss'} <b>${money(Math.abs(profit), cur)}</b></span>
      </figcaption>
    </figure>`;
}

function ItemEditor({ item, scenario, cur, fresh, onPatch, onClose, onRemove }) {
  const nameRef = useRef(null);
  // Новую статью сразу называем: строка без имени в таблице выглядит как ошибка.
  // Layout-эффект — в том же нажатии: iPhone открывает клавиатуру, только если фокус пришёл из жеста.
  useLayoutEffect(() => { if (fresh) nameRef.current?.focus(); }, []);
  const housing = Boolean(item.placeId);
  return html`
    <div class="ied">
      <label class="fld ied-name">
        <span class="fld-l">Name</span>
        <span class="fld-box"><input ref=${nameRef} value=${item.name} placeholder="Untitled item" autocomplete="off"
          onInput=${(e) => onPatch({ name: e.currentTarget.value })} /></span>
      </label>
      <${NumberField} label=${scenario === 'fact' ? 'Actual rate' : 'Rate'} value=${item[scenario]} live prefix=${cur}
        hint=${scenario === 'fact' ? `Plan ${rateText(item.plan, cur)}` : undefined}
        onCommit=${(v) => onPatch({ [scenario]: v })} />
      ${housing
        ? html`<p class="ied-note">Housing is counted for the nights of the people who stay there.</p>`
        : html`
          <label class="fld">
            <span class="fld-l">Unit</span>
            <span class="fld-box"><select value=${item.unit} onChange=${(e) => onPatch({ unit: e.currentTarget.value })}>
              ${Object.entries(UNITS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}
            </select></span>
          </label>
          <div class="fld ied-split">
            <span class="fld-l">Split</span>
            <div class="seg" role="group" aria-label="Split">
              ${Object.entries(SPLIT_LABELS).map(([k, l]) => html`
                <button type="button" aria-pressed=${item.split === k} onClick=${() => onPatch({ split: k })}>${l}</button>`)}
            </div>
          </div>`}
      ${item.split !== 'personal' && html`
        <label class="ied-check">
          <input type="checkbox" checked=${item.mine} onChange=${(e) => onPatch({ mine: e.currentTarget.checked })} />
          <span>Your own work: the money for it comes to you</span>
        </label>`}
      <div class="ied-foot">
        <button type="button" class="quiet" onClick=${onRemove}>Delete item</button>
        <button type="button" class="quiet" onClick=${onClose}>Done</button>
      </div>
    </div>`;
}
