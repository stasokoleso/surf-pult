// Service worker: отдаёт Пульт из кэша, чтобы он открывался без сети.
// Данные кемпов сюда не попадают — они в IndexedDB. Здесь только файлы приложения.
// Блок ниже пишет `npm run offline`.
// <offline-files>
const VERSION = 'e9b78ae700ef';
const FILES = [
  "./app.js",
  "./core/anatomy.js",
  "./core/calc.js",
  "./core/edit.js",
  "./core/legacy.js",
  "./core/model.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/og-image.png",
  "./index.html",
  "./manifest.webmanifest",
  "./store/index.js",
  "./store/transfer.js",
  "./ui/Anatomy.js",
  "./ui/App.js",
  "./ui/Backup.js",
  "./ui/CampList.js",
  "./ui/CampPage.js",
  "./ui/Contract.js",
  "./ui/Roster.js",
  "./ui/WhatIf.js",
  "./ui/fields.js",
  "./ui/format.js",
  "./ui/html.js",
  "./ui/list-data.js",
  "./ui/state.js",
  "./ui/styles.css",
  "./vendor/fonts/newsreader.woff2",
  "./vendor/fonts/schibsted-grotesk.woff2",
  "./vendor/hooks.js",
  "./vendor/htm.js",
  "./vendor/preact.js",
  "./vendor/signals-core.js",
  "./vendor/signals.js"
];
// </offline-files>
const CACHE = `pult-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Мимо HTTP-кэша браузера: иначе в новый набор мог бы попасть старый файл.
    // addAll атомарен — если сеть оборвётся, останется прежняя версия целиком.
    await cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    // Новая версия встаёт сразу: открытая страница дорабатывает на уже загруженных модулях
    // и предлагает перезагрузиться. Иначе на iPhone приложение с «Домой» могло бы застрять на старой.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith('pult-') && k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Страница у Пульта одна, разделы — после #, так что любой переход — это index.html.
    const hit = await cache.match(request.mode === 'navigate' ? './index.html' : request, { ignoreSearch: true });
    return hit ?? fetch(request);
  })());
});
