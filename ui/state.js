import { signal } from '../vendor/signals.js';
import { blankCamp, normalizeCamp } from '../core/model.js';
import { openStore } from '../store/index.js';
import { applyImport, backupFile, inFile, planImport, readBackup, timeOf } from '../store/transfer.js';
import { campName, plural } from './format.js';

export const phase = signal('loading'); // loading | ready | failed
export const failure = signal('');
export const camps = signal([]);
export const route = signal({ name: 'list' });
export const filters = signal({ q: '', year: 'all' });
export const toast = signal(null); // { text, action: { label, run } | null }
export const storage = signal({ persisted: null, tab: false });
export const lastBackup = signal(''); // ISO-время последней копии
export const importing = signal(null); // { opened, fileName, rows, warnings, exportedAt }

let store = null;
let toastTimer = 0;
const BACKUP_KEY = 'pult.lastBackup';
const MAX_FILE = 20 * 1024 * 1024;

function parseHash(hash) {
  const m = /^#\/camp\/([^/?#]+)$/.exec(hash);
  return m ? { name: 'camp', id: decodeURIComponent(m[1]) } : { name: 'list' };
}

export async function start() {
  const sync = () => { route.value = parseHash(location.hash); };
  addEventListener('hashchange', sync);
  sync();
  try {
    store = await openStore();
    camps.value = await store.list();
    lastBackup.value = readLastBackup();
    phase.value = 'ready';
    checkStorage().then((s) => { storage.value = s; });
  } catch (err) {
    failure.value = err?.message ?? String(err);
    phase.value = 'failed';
  }
}

/* Просим браузер не стирать базу, когда мало места. Гарантии не даёт ни один браузер,
   поэтому ответ только выбирает текст плашки, а защищает файл копии. */
async function checkStorage() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // У вкладки Safari и приложения с «Домой» разные базы: кемпы из вкладки на «Домой» сами не переедут.
  const tab = ios && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  if (!navigator.storage?.persist) return { persisted: null, tab };
  try {
    return { persisted: (await navigator.storage.persisted()) || (await navigator.storage.persist()), tab };
  } catch {
    return { persisted: null, tab };
  }
}

// Дата копии — подсказка, а не данные: если её не прочитать, плашка просто позовёт сделать копию.
function readLastBackup() {
  try { return localStorage.getItem(BACKUP_KEY) ?? ''; } catch { return ''; }
}
function setLastBackup(at) {
  lastBackup.value = at;
  try {
    if (at) localStorage.setItem(BACKUP_KEY, at);
    else localStorage.removeItem(BACKUP_KEY);
  } catch { /* см. readLastBackup */ }
}

export function setFilters(patch) {
  filters.value = { ...filters.value, ...patch };
}

export function showToast(text, action = null) {
  clearTimeout(toastTimer);
  toast.value = { text, action };
  // Плашку с отменой держим дольше: пока она видна, удалённое ещё можно вернуть.
  toastTimer = setTimeout(() => { toast.value = null; }, action ? 14000 : 4000);
}

// Ошибку записи не глотаем: иначе на экране кемп есть, а в базе его нет.
async function write(fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    showToast(`Not saved: ${err?.message ?? err}`);
    return false;
  }
}

/* Правка открытого кемпа. false — правку применить нельзя.
   В базу пишем сразу, без паузы: отложенную запись браузер обрывал, если страницу закрывали
   или перезагружали в эти доли секунды, и дописать её при выгрузке не получалось (проверено).
   Запись кемпа — доли миллисекунды, а транзакции идут по очереди, так что последняя правка побеждает. */
export function updateCamp(id, change) {
  const camp = camps.value.find((c) => c.id === id);
  const changed = camp && change(camp);
  if (!changed) return false;
  const next = { ...normalizeCamp(changed), updatedAt: new Date().toISOString() };
  camps.value = camps.value.map((c) => (c.id === id ? next : c));
  write(() => store.put(next));
  return true;
}

export async function createCamp() {
  const now = new Date();
  const camp = { ...blankCamp({ now }), createdAt: now.toISOString(), updatedAt: now.toISOString() };
  if (!(await write(() => store.put(camp)))) return;
  camps.value = [camp, ...camps.value];
  location.hash = `#/camp/${encodeURIComponent(camp.id)}`;
}

/* ---------- перенос файлом ---------- */

/* На телефоне файл уходит через «Поделиться»: в Файлы, AirDrop, Telegram. iOS не сохраняет файл
   по ссылке download. На Mac — обычная загрузка: там «Поделиться» не умеет положить файл в папку. */
export async function backUp() {
  const list = camps.value;
  const now = new Date();
  const { name, text } = backupFile(list, now);
  const file = new File([text], name, { type: 'application/json' });
  const share = matchMedia('(pointer: coarse)').matches && Boolean(navigator.canShare?.({ files: [file] }));
  try {
    if (share) await navigator.share({ files: [file] });
    else download(file);
  } catch (err) {
    if (err?.name !== 'AbortError') showToast(`Backup failed: ${err?.message ?? err}`);
    return;
  }
  setLastBackup(now.toISOString());
  showToast(share ? `Backup shared: ${plural(list.length, 'camp')}` : `Saved ${name}`);
}

function download(file) {
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openBackup(file) {
  try {
    if (file.size > MAX_FILE) throw new Error('This file is too big to be a Pult backup.');
    const data = readBackup(await file.text());
    importing.value = {
      opened: Date.now(), fileName: file.name, rows: planImport(camps.value, data.camps),
      warnings: data.warnings, exportedAt: data.exportedAt,
    };
  } catch (err) {
    showToast(err?.message ?? String(err));
  }
}

export function cancelImport() {
  importing.value = null;
}

export async function confirmImport(pickedIds) {
  const job = importing.value;
  importing.value = null;
  if (!job) return;
  const plan = applyImport(camps.value, job.rows.map((r) => ({ ...r, pick: pickedIds.has(r.camp.id) })));
  if (!plan.count || !(await write(() => store.apply(plan.write)))) return;
  camps.value = plan.camps;
  // Всё, что теперь на устройстве, лежит в этом файле — копия уже есть, звать делать новую рано.
  const before = lastBackup.value;
  if (timeOf(job.exportedAt) > timeOf(before) && inFile(plan.camps, job.rows.map((r) => r.camp))) setLastBackup(job.exportedAt);
  showToast(`Imported ${plural(plan.count, 'camp')}`, {
    label: 'Undo',
    run: async () => {
      if (!(await write(() => store.apply(plan.undo)))) return;
      const back = new Map(plan.undo.put.map((c) => [c.id, c]));
      const gone = new Set(plan.undo.remove);
      camps.value = camps.value.filter((c) => !gone.has(c.id)).map((c) => back.get(c.id) ?? c);
      setLastBackup(before);
      showToast('Import undone');
    },
  });
}

export async function deleteCamp(id) {
  const camp = camps.value.find((c) => c.id === id);
  if (!camp) return;
  if (!(await write(() => store.remove(id)))) return;
  camps.value = camps.value.filter((c) => c.id !== id);
  location.hash = '#/';
  showToast(`Deleted “${campName(camp)}”`, {
    label: 'Undo',
    run: async () => {
      if (!(await write(() => store.put(camp)))) return;
      camps.value = [...camps.value, camp];
      location.hash = `#/camp/${encodeURIComponent(camp.id)}`;
      showToast('Camp restored');
    },
  });
}
