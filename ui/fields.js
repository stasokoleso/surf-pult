import { html } from './html.js';
import { useEffect, useRef, useState } from '../vendor/hooks.js';
import { parseNumber } from './format.js';

const asText = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');

/* Поле держит свой текст: иначе «12,» или пустое поле при наборе сразу превращались бы в число.
   live — пересчитывать на лету; без него число уходит в кемп только по Enter или уходу из поля:
   промежуточное «1» при наборе «12» учеников удалило бы остальных вместе с именами.
   clearable — пустое поле значит «своего числа нет» (null), а не «оставь как было». */
export function NumberField({ label, value, onCommit, live = false, clearable = false, prefix, suffix, hint, placeholder }) {
  const [text, setText] = useState(asText(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(asText(value)); }, [value]);

  const empty = (t) => clearable && t.trim() === '';
  const commit = (t) => {
    const v = empty(t) ? null : parseNumber(t);
    if ((v !== null || empty(t)) && v !== value) onCommit(v);
  };

  return html`
    <label class="fld">
      <span class="fld-l">${label}</span>
      <span class="fld-box">
        ${prefix && html`<span class="fld-aff">${prefix}</span>`}
        <input inputmode="decimal" enterkeyhint="done" autocomplete="off" value=${text} placeholder=${placeholder}
          onFocus=${() => { focused.current = true; }}
          onInput=${(e) => { const t = e.currentTarget.value; setText(t); if (live) commit(t); }}
          onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onBlur=${(e) => {
            const t = e.currentTarget.value;
            focused.current = false;
            commit(t);
            setText(asText(empty(t) ? null : parseNumber(t) ?? value));
          }} />
        ${suffix && html`<span class="fld-aff">${suffix}</span>`}
      </span>
      ${hint && html`<span class="fld-hint">${hint}</span>`}
    </label>`;
}

/* Дата уходит в кемп только по Enter или уходу из поля: Chrome шлёт change на каждую набранную цифру,
   а промежуточная дата сдвинула бы длину кемпа и безвозвратно обрезала даты людей.
   onCommit вернул false — правку не приняли, и поле возвращается к прежней дате. */
export function DateField({ label, value, onCommit, min, max, disabled = false }) {
  return html`
    <label class="fld fld-date">
      <span class="fld-l">${label}</span>
      <span class="fld-box"><input type="date" value=${value} min=${min} max=${max} disabled=${disabled}
        onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur=${(e) => {
          const input = e.currentTarget;
          if (input.value !== value && !onCommit(input.value)) input.value = value;
        }} /></span>
    </label>`;
}
