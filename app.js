import { render } from './vendor/preact.js';
import { html } from './ui/html.js';
import { App } from './ui/App.js';
import { showToast, start } from './ui/state.js';

render(html`<${App} />`, document.getElementById('app'));
start();

// Без service worker Пульт на iPhone без сети не откроется. Ошибку не прячем в тишину, но и приложение она не ломает.
if ('serviceWorker' in navigator) {
  const hadVersion = Boolean(navigator.serviceWorker.controller);
  // При первой установке сменить нечего; позже смена значит, что встала новая версия, а модули в памяти старые.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadVersion) showToast('Pult was updated', { label: 'Reload', run: () => location.reload() });
  });
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Pult works online only:', err));
}
