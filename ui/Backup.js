import { html } from './html.js';
import { useEffect, useRef, useState } from '../vendor/hooks.js';
import { countedResult } from '../core/calc.js';
import { timeOf } from '../store/transfer.js';
import { campName, dateRange, money, plural } from './format.js';
import { backUp, camps, cancelImport, confirmImport, importing, lastBackup, openBackup, storage } from './state.js';

const DAY = 86_400_000;
const midnight = (t) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/* Текст плашки копии и звать ли к ней. Тревожим не за каждую правку, а когда несохранённое копится
   3+ дня: Safari стирает данные сайта, если в него не заходить 7 дней. */
export function backupSummary({ camps: list, last, storage: st, now = Date.now() }) {
  const lastAt = timeOf(last);
  const days = lastAt ? Math.round((midnight(now) - midnight(lastAt)) / DAY) : null;
  const changed = list.some((c) => !lastAt || timeOf(c.updatedAt) > lastAt);
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const risk = st.tab
    ? 'Safari may clear camps kept in a tab. Add Pult to the Home Screen and import the file there.'
    : st.persisted === false
      ? 'This browser may clear site data. The file is your safety copy.'
      : 'Your camps live only on this device.';
  return {
    title: !lastAt ? 'No backup yet' : changed ? `Last backup ${ago}` : 'Backup is up to date',
    risk,
    stale: list.length > 0 && changed && (!lastAt || days >= 3),
  };
}

export function BackupPanel() {
  const s = backupSummary({ camps: camps.value, last: lastBackup.value, storage: storage.value });
  return html`
    <div class="backup" data-stale=${s.stale ? '' : undefined}>
      <div class="backup-t">
        <b>${s.title}</b>
        <span>${s.risk}</span>
        <small>The file includes student names. Keep it to yourself.</small>
      </div>
      <button type="button" onClick=${backUp}>Back up</button>
    </div>`;
}

// Без accept: на iPhone он делает файлы из iCloud серыми и невыбираемыми. Содержимое всё равно проверяем.
export function ImportButton() {
  const input = useRef(null);
  const pick = (e) => {
    const file = e.currentTarget.files[0];
    e.currentTarget.value = ''; // тот же файл второй раз тоже должен открыться
    if (file) openBackup(file);
  };
  return html`
    <button type="button" class="link" onClick=${() => input.current.click()}>Import</button>
    <input ref=${input} type="file" hidden onChange=${pick} />`;
}

export function ImportDialog() {
  const job = importing.value;
  return job ? html`<${Preview} key=${job.opened} job=${job} />` : null;
}

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const when = (iso) => (timeOf(iso) ? WHEN.format(timeOf(iso)) : 'an unknown date');

const STATE_TEXT = {
  new: () => 'New',
  newer: (r) => `Newer, replaces yours from ${when(r.existing.updatedAt)}`,
  older: (r) => `Older than yours from ${when(r.existing.updatedAt)}`,
  same: () => 'Already here',
};

// Предпросмотр слияния: что добавится, что заменится и чем, что останется как есть.
function Preview({ job }) {
  const ref = useRef(null);
  const [picked, setPicked] = useState(() => new Set(job.rows.filter((r) => r.pick).map((r) => r.camp.id)));
  useEffect(() => { ref.current.showModal(); }, []);

  const toggle = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const count = job.rows.filter((r) => r.state !== 'same' && picked.has(r.camp.id)).length;
  const take = (camp) => money(countedResult(camp).mine.take, camp.currency);

  return html`
    <dialog ref=${ref} class="sheet" aria-labelledby="import-title" onClose=${cancelImport}>
      <header class="sheet-h">
        <h2 id="import-title">Import camps</h2>
        <p>${job.fileName}${job.exportedAt ? ` · saved ${when(job.exportedAt)}` : ''}</p>
      </header>
      ${job.warnings.length > 0 && html`
        <details class="imp-warn">
          <summary>${plural(job.warnings.length, 'note')} from the old Pult: check these camps after import</summary>
          <ul>${job.warnings.map((w) => html`<li>${w}</li>`)}</ul>
        </details>`}
      <ul class="imp-list">
        ${job.rows.map((r) => html`
          <li key=${r.camp.id}>
            <label class="imp-row" data-state=${r.state}>
              <input type="checkbox" checked=${r.state !== 'same' && picked.has(r.camp.id)} disabled=${r.state === 'same'}
                onChange=${() => toggle(r.camp.id)} />
              <span class="imp-n">${campName(r.camp)}</span>
              <span class="imp-p">${take(r.camp)}</span>
              <span class="imp-s">${[dateRange(r.camp.startDate, r.camp.days), STATE_TEXT[r.state](r)].filter(Boolean).join(' · ')}</span>
              ${r.existing && r.state !== 'same' && html`<span class="imp-y">yours ${take(r.existing)}</span>`}
            </label>
          </li>`)}
      </ul>
      <footer class="sheet-f">
        <button type="button" class="quiet" onClick=${() => ref.current.close()}>Cancel</button>
        <button type="button" class="primary" disabled=${count === 0} onClick=${() => confirmImport(picked)}>
          ${count ? `Import ${plural(count, 'camp')}` : 'Nothing to import'}
        </button>
      </footer>
    </dialog>`;
}
