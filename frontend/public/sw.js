// Minimal service worker to allow PWA installation in Chrome
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Fetch event handler omitted to prevent navigation overhead warnings.
// Modern Chromium PWA installability does not require an empty fetch handler.
