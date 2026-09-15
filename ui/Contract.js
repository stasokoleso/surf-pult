import { html } from './html.js';
import { contractFlow } from '../core/anatomy.js';
import { money } from './format.js';

const LABELS = { student: 'Per-student items', housing: 'Housing', shared: 'Shared costs', personal: 'My costs' };

/* Водопад: сверху выручка, по шагу уходят расходы, внизу — что остаётся тебе.
   Штриховка — твоя работа внутри расходов: деньги уходят из выручки, но возвращаются к тебе. */
export function Contract({ r, cur, reservePct }) {
  const f = contractFlow(r);
  const head = html`<div class="kicker">Where the money goes</div>`;
  if (!(f.revenue > 0)) {
    return html`
      <section class="contract">
        ${head}
        <h2 class="bt">No revenue yet</h2>
        <p class="bs">Set a seat price and add students to see how much of the money stays with you.</p>
      </section>`;
  }

  // Шкала от самого низкого значения до выручки: при убытке прибыль уходит левее нуля, и это видно.
  const lo = Math.min(0, f.profit, f.take);
  const hi = Math.max(f.revenue, f.take);
  const x = (v) => (v - lo) / (hi - lo) * 100;
  const seg = (from, to, k, hatch = false) => {
    const [a, b] = from < to ? [from, to] : [to, from];
    return b > a && html`<span class=${`k-${k}${hatch ? ' hatch' : ''}`} style=${{ left: `${x(a)}%`, width: `${x(b) - x(a)}%` }}></span>`;
  };

  let cum = f.revenue;
  const rows = [{ label: 'Revenue', value: money(f.revenue, cur), track: seg(0, f.revenue, 'ink'), cls: 'key' }];
  for (const s of f.costs) {
    rows.push({
      label: s.key === 'reserve' ? `Reserve ${reservePct}%` : LABELS[s.key],
      value: money(-s.value, cur),
      track: [seg(cum - s.value, cum, s.key), s.mine > 0 && seg(cum - s.mine, cum, 'profit', true)],
    });
    cum -= s.value;
  }
  rows.push({ label: 'Profit', value: money(f.profit, cur), track: seg(0, f.profit, 'profit'), cls: 'key' });
  if (f.fee > 0) {
    rows.push({ label: '+ Your own work', value: `+${money(f.fee, cur)}`, track: seg(f.profit, f.profit + f.fee, 'profit', true) });
  }
  rows.push({ label: 'Your take', value: money(f.take, cur), track: seg(0, f.take, 'profit'), cls: 'key acc' });

  const title = f.take >= 0
    ? `You keep ${money(f.take, cur)} of ${money(f.revenue, cur)}`
    : `You lose ${money(-f.take, cur)} on this camp`;
  const sub = f.take >= 0
    ? `${Math.round(f.take / f.revenue * 100)}% of the money stays with you. ${money(f.outflow, cur)} goes out to others.`
    : `${money(f.outflow, cur)} goes out to others, more than the camp brings in.`;
  const zero = lo < 0 && html`<i class="wf-zero" style=${{ left: `${x(0)}%` }}></i>`;

  return html`
    <section class="contract">
      ${head}
      <h2 class="bt">${title}</h2>
      <p class="bs">${sub}</p>
      <div class="wf">
        ${rows.map((row) => html`
          <div class=${`wrow ${row.cls ?? ''}`}>
            <span class="wl">${row.label}</span>
            <span class="track">${zero}${row.track}</span>
            <span class="wv">${row.value}</span>
          </div>`)}
      </div>
    </section>`;
}
