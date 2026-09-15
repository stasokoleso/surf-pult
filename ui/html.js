import { h } from '../vendor/preact.js';
import htm from '../vendor/htm.js';

// htm превращает шаблон html`<div>…</div>` в вызовы h() — это заменяет JSX без сборки.
export const html = htm.bind(h);
