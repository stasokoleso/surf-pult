// Единственный вход к данным. Интерфейс не знает, что внутри IndexedDB:
// когда появится синхронизация (вариант D в PLAN.md), меняется только этот файл.
import { normalizeCamp } from '../core/model.js';

const DB_NAME = 'pult';
const DB_VERSION = 1;
const CAMPS = 'camps';

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openStore(idb = globalThis.indexedDB) {
  if (!idb) throw new Error('This browser has no IndexedDB.');
  const opening = idb.open(DB_NAME, DB_VERSION);
  opening.onupgradeneeded = () => opening.result.createObjectStore(CAMPS, { keyPath: 'id' });
  const db = await request(opening);
  // Иначе новая версия приложения в соседней вкладке не сможет обновить базу и будет ждать вечно.
  db.onversionchange = () => db.close();

  // Ждём конца транзакции, а не запроса: только тогда база действительно приняла запись.
  const run = (mode, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPS, mode);
    let req;
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The storage transaction was aborted.'));
    try {
      req = fn(tx.objectStore(CAMPS));
    } catch (err) {
      // Запросы до ошибки уже в транзакции и записались бы сами — импорт лёг бы наполовину.
      tx.abort();
      reject(err);
    }
  });

  return {
    list: async () => (await run('readonly', (s) => s.getAll())).map(normalizeCamp),
    put: async (camp) => { await run('readwrite', (s) => s.put(camp)); },
    remove: async (id) => { await run('readwrite', (s) => s.delete(id)); },
    // Импорт одной транзакцией: либо записались все кемпы из файла, либо ни один.
    apply: async ({ put = [], remove = [] }) => {
      await run('readwrite', (s) => {
        for (const camp of put) s.put(camp);
        for (const id of remove) s.delete(id);
      });
    },
  };
}
