import { html } from './html.js';
import { useLayoutEffect, useRef, useState } from '../vendor/hooks.js';
import { studentCurve } from '../core/calc.js';
import { money, plural } from './format.js';

const H = 240;
const M = { l: 48, r: 72, t: 28, b: 36 };

// Круглые деления шкалы: €0, €2.5k, €5k — подписи вроде «€4,137» на оси не читаются.
function niceTicks(lo, hi, count) {
  const raw = (hi - lo || 1) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const out = [];
  for (let i = Math.floor(lo / step); i <= Math.ceil(hi / step); i++) out.push(i * step);
  return out;
}

function shortMoney(v, cur) {
  const a = Math.abs(v);
  return `${v < 0 && a > 0 ? '−' : ''}${cur}${a >= 1000 ? `${Math.round(a / 100) / 10}k` : Math.round(a)}`;
}

// Рисуем в настоящую ширину блока: у растянутого viewBox текст на телефоне мельчал бы вместе с картинкой.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(ref.current.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* «Если группа другая»: прибыль и «моё на руки» при разном числе учеников.
   Тянешь график или ползунок — вся страница примеряет это число, а состав не меняется. */
export function WhatIf({ camp, scenario, n, onPick }) {
  const [box, W] = useWidth();
  const gesture = useRef(null);
  const { lo, hi, actual, points } = studentCurve(camp, scenario);
  const cur = camp.currency;
  const k = Math.min(Math.max(n, lo), hi);
  const at = (j) => points.find((p) => p.n === j);
  const here = at(k);
  const be = points.find((p) => p.profit >= 0);

  const title = !be ? `No break-even up to ${plural(hi, 'student')}`
    : be.n === lo ? `In profit even with ${plural(lo, 'student')}`
      : `Break-even at ${plural(be.n, 'student')}`;
  const step = at(k + 1) ? at(k + 1).profit - here.profit : here.profit - at(k - 1).profit;
  const sub = `At ${k}: profit ${money(here.profit, cur)}, your take ${money(here.take, cur)}. `
    + `Each extra student for the whole camp ${step >= 0 ? 'adds' : 'costs'} about ${money(Math.abs(step), cur)}.`;

  // Горизонтальный жест выбирает число, вертикальный отдаём прокрутке страницы.
  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const j = Math.round(lo + (e.clientX - box.left - M.l) / (W - M.l - M.r) * (hi - lo));
    onPick(Math.min(Math.max(j, lo), hi));
  };
  const down = (e) => {
    gesture.current = { x: e.clientX, y: e.clientY, on: e.pointerType === 'mouse' };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (gesture.current.on) pick(e);
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.on && Math.abs(e.clientX - g.x) > 8 && Math.abs(e.clientX - g.x) > Math.abs(e.clientY - g.y)) g.on = true;
    if (g.on) pick(e);
  };
  const up = (e) => {
    if (gesture.current && e.type === 'pointerup') pick(e);
    gesture.current = null;
  };

  let chart = null;
  if (W > 0) {
    const ticks = niceTicks(Math.min(0, ...points.map((p) => p.profit)), Math.max(0, ...points.map((p) => p.take)), 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const x = (j) => M.l + (j - lo) / (hi - lo) * (W - M.l - M.r);
    const y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
    const line = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.n).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const roomy = (W - M.l - M.r) / (hi - lo) >= 22;
    const last = points[points.length - 1];
    const yProfit = y(last.profit) + 4;
    const yTake = Math.min(y(last.take) + 4, yProfit - 14);
    const label = Math.min(Math.max(x(k), M.l + 56), W - M.r - 56);
    chart = html`
      <svg class="wi-svg" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img"
        aria-label=${`Profit and your take for ${lo} to ${hi} students`}
        onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        ${ticks.map((t) => html`
          <line class=${t === 0 ? 'zero' : 'grid'} x1=${M.l} x2=${W - M.r} y1=${y(t)} y2=${y(t)} />
          <text x=${M.l - 8} y=${y(t) + 4} text-anchor="end">${shortMoney(t, cur)}</text>`)}
        ${points.map((p) => (roomy || (p.n - lo) % 2 === 0 || p.n === actual || p.n === k) && html`
          <text class=${p.n === actual ? 'now-n' : ''} x=${x(p.n)} y=${H - M.b + 18} text-anchor="middle">${p.n}</text>`)}
        <text x=${M.l} y=${H - 2}>students</text>
        <line class="tick" x1=${x(actual)} x2=${x(actual)} y1=${H - M.b} y2=${H - M.b + 5} />
        <line class="now" x1=${x(k)} x2=${x(k)} y1=${M.t - 6} y2=${H - M.b} />
        <path class="l-take" d=${line('take')} />
        <path class="l-profit" d=${line('profit')} />
        <text x=${W - M.r + 8} y=${yTake}>Your take</text>
        <text class="acc" x=${W - M.r + 8} y=${yProfit}>Profit</text>
        ${be && be.n > lo && html`<circle class="be" cx=${x(be.n)} cy=${y(0)} r="3" />`}
        <circle class="dot-take" cx=${x(k)} cy=${y(here.take)} r="3.5" />
        <circle class="dot" cx=${x(k)} cy=${y(here.profit)} r="6" />
        <text class="acc" x=${label} y=${M.t - 12} text-anchor="middle">${plural(k, 'student')} · ${money(here.profit, cur)}</text>
      </svg>`;
  }

  return html`
    <section class="whatif-b" aria-labelledby="whatif-title">
      <div class="kicker">If the group is different</div>
      <h2 class="bt" id="whatif-title">${title}</h2>
      <p class="bs">${sub}</p>
      <div class="wi-box" ref=${box}>${chart}</div>
      <label class="wi-range">
        <span>${lo}</span>
        <input type="range" min=${lo} max=${hi} step="1" value=${k} aria-label="Students, what if"
          onInput=${(e) => onPick(Number(e.currentTarget.value))} />
        <span>${hi}</span>
      </label>
    </section>`;
}
