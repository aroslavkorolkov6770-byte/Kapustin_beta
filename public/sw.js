// PWA сохраняет свой Service Worker; обработчиков внешних Push-уведомлений нет.
self.addEventListener('install', function (event) {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});
