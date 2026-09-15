import { html } from './html.js';
import { ImportDialog } from './Backup.js';
import { CampList } from './CampList.js';
import { CampPage } from './CampPage.js';
import { failure, phase, route, toast } from './state.js';

export function App() {
  if (phase.value === 'loading') return html`<div class="boot" aria-busy="true"></div>`;
  if (phase.value === 'failed') return html`<${StorageFailed} message=${failure.value} />`;

  const r = route.value;
  return html`
    <div class="shell" data-view=${r.name}>
      <aside class="side"><${CampList} selectedId=${r.id} /></aside>
      <main class="main">
        ${r.name === 'camp'
          ? html`<${CampPage} id=${r.id} />`
          : html`<p class="welcome">Pick a camp from the list, or start a new one.</p>`}
      </main>
    </div>
    <${ImportDialog} />
    <${Toast} />`;
}

function StorageFailed({ message }) {
  return html`
    <main class="fail">
      <h1>Pult can’t open its storage</h1>
      <p>Your camps are kept in this browser’s storage, and the browser refused access.
        That happens in private windows and when site data is blocked in settings.
        Open Pult in a regular window.</p>
      <p class="detail">${message}</p>
    </main>`;
}

// Контейнер живёт всегда: экранная читалка озвучивает только изменения уже существующей области.
function Toast() {
  const t = toast.value;
  return html`
    <div class="toast-slot" role="status" aria-live="polite">
      ${t && html`
        <div class="toast">
          <span>${t.text}</span>
          ${t.action && html`
            <button type="button" onClick=${() => { toast.value = null; t.action.run(); }}>${t.action.label}</button>`}
        </div>`}
    </div>`;
}
