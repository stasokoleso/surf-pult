// Перенос кемпов файлом: формат копии и слияние с кемпами на устройстве.
// Только чистые функции: «Поделиться» и выбор файла — в ui/state.js, запись — в store/index.js.
import { isLegacyCamp, readLegacyFile } from '../core/legacy.js';
import { SCHEMA, isoLocal, normalizeCamp } from '../core/model.js';

export function backupFile(camps, now = new Date()) {
  const data = { app: 'pult', schema: SCHEMA, exportedAt: now.toISOString(), camps };
  return { name: `pult-backup-${isoLocal(now)}.json`, text: JSON.stringify(data, null, 2) };
}

// Читает и копию v2, и «Копию» старого Пульта: у старого тоже app: 'pult', но у кемпов нет schema.
export function readBackup(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t a Pult backup: it can’t be read as JSON.');
  }
  const list = Array.isArray(json) ? json : json?.camps;
  if (!Array.isArray(list)) throw new Error('This file isn’t a Pult backup: there are no camps in it.');
  // Более новая версия могла добавить поля, которых эта не знает, — normalizeCamp молча выбросил бы их.
  if ([json, ...list].some((x) => Number(x?.schema) > SCHEMA)) {
    throw new Error('This backup is from a newer Pult. Reload Pult to update it, then import again.');
  }
  const legacy = list.some(isLegacyCamp);
  const read = legacy
    ? readLegacyFile(json)
    : { camps: list.filter((c) => typeof c?.id === 'string' && c.id).map(normalizeCamp), warnings: [] };
  if (!read.camps.length) throw new Error('No camps found in this file.');
  // Один кемп дважды в файле — берём последний, иначе он записался бы дважды.
  const camps = [...new Map(read.camps.map((c) => [c.id, c])).values()];
  const stamp = json?.exportedAt ?? json?.savedAt;
  return { camps, warnings: read.warnings, legacy, exportedAt: typeof stamp === 'string' ? stamp : '' };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Старый Пульт писал время без часового пояса, v2 пишет в UTC: сравниваем моменты, а не строки.
export const timeOf = (iso) => Date.parse(iso) || 0;

/* Судьба каждого кемпа из файла: new, newer, older или same.
   По умолчанию отмечено только новое и более свежее: старая копия не затирает свежие правки.
   Время правки совпало, а содержимое нет — считаем старее: свои правки важнее. */
export function planImport(current, incoming) {
  const mine = new Map(current.map((c) => [c.id, c]));
  return incoming.map((camp) => {
    const existing = mine.get(camp.id) ?? null;
    const state = !existing ? 'new' : same(camp, existing) ? 'same' : timeOf(camp.updatedAt) > timeOf(existing.updatedAt) ? 'newer' : 'older';
    return { camp, existing, state, pick: state === 'new' || state === 'newer' };
  });
}

// Пишется только отмеченное. undo — что вернуть при «Undo»: заменённые кемпы обратно, добавленные убрать.
export function applyImport(current, rows) {
  const picked = rows.filter((r) => r.pick && r.state !== 'same');
  const incoming = new Map(picked.map((r) => [r.camp.id, r.camp]));
  const known = new Set(current.map((c) => c.id));
  const added = picked.filter((r) => !known.has(r.camp.id)).map((r) => r.camp);
  return {
    count: picked.length,
    camps: [...current.map((c) => incoming.get(c.id) ?? c), ...added],
    write: { put: picked.map((r) => r.camp), remove: [] },
    undo: { put: current.filter((c) => incoming.has(c.id)), remove: added.map((c) => c.id) },
  };
}

// Всё, что на устройстве, совпадает с файлом — значит, этот файл и есть свежая копия.
export function inFile(camps, fileCamps) {
  const file = new Map(fileCamps.map((c) => [c.id, c]));
  return camps.every((c) => file.has(c.id) && same(c, file.get(c.id)));
}
