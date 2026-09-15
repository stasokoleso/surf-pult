import { html } from './html.js';
import { STATUSES } from '../core/model.js';
import { BackupPanel, ImportButton } from './Backup.js';
import { buildList } from './list-data.js';
import { campName, dateRange, money, monthLabel, plural } from './format.js';
import { camps, createCamp, filters, setFilters } from './state.js';

const joined = (sums, key) => sums.map((s) => money(s[key], s.currency)).join(' + ');

export function CampList({ selectedId }) {
  const all = camps.value;
  const data = buildList(all, filters.value);
  const { total } = data;

  return html`
    <div class="list">
      <div class="list-head">
        <h1 class="list-title">Camps</h1>
        <${ImportButton} />
      </div>
      ${all.length > 0 && html`<${BackupPanel} />`}
      ${all.length > 0 && html`
        <div class="list-tools">
          <input class="search" type="search" placeholder="Search camps" aria-label="Search camps"
            value=${filters.value.q} onInput=${(e) => setFilters({ q: e.currentTarget.value })} />
          ${data.years.length > 0 && html`
            <div class="chips" role="group" aria-label="Year">
              ${['all', ...data.years].map((y) => html`
                <button type="button" class="chip" aria-pressed=${data.year === y}
                  onClick=${() => setFilters({ year: y })}>${y === 'all' ? 'All' : y}</button>`)}
            </div>`}
        </div>`}
      ${total.n > 0 && html`
        <div class="yr">
          <small>${data.year === 'all' ? 'All years' : data.year} · ${plural(total.n, 'camp')} · ${plural(total.students, 'student')}</small>
          <b>${joined(total.sums, 'take')}</b>
          <small>your take · profit ${joined(total.sums, 'profit')}${total.usesFact ? ' · done camps count actuals' : ''}</small>
        </div>`}
      ${all.length === 0
        ? html`<div class="empty"><h2>No camps yet</h2><p>Start one — typical costs are already filled in. Moving from another device? Import its backup file.</p></div>`
        : total.n === 0
          ? html`<div class="empty"><h2>Nothing found</h2><p>Try another search or year.</p></div>`
          : data.groups.map((g) => html`
            <section class="month" key=${g.key}>
              <h2 class="mh"><span>${g.key ? monthLabel(g.key) : 'No date'}</span><span class="num">${joined(g.sums, 'take')}</span></h2>
              ${g.rows.map((r) => html`<${Row} key=${r.id} row=${r} current=${r.id === selectedId} />`)}
            </section>`)}
      <div class="new-bar"><button type="button" class="primary" onClick=${createCamp}>New camp</button></div>
    </div>`;
}

function Row({ row, current }) {
  const facts = [dateRange(row.startDate, row.days), plural(row.students, 'student'), `profit ${money(row.profit, row.currency)}`];
  return html`
    <a class="lrow" href=${`#/camp/${encodeURIComponent(row.id)}`} aria-current=${current ? 'page' : undefined}>
      <span class="n">${campName(row)}</span>
      <span class="p">${money(row.take, row.currency)}</span>
      <span class="s">${facts.filter(Boolean).join(' · ')}</span>
      <span class=${`pill ${row.status}`}>${STATUSES[row.status]}</span>
    </a>`;
}
