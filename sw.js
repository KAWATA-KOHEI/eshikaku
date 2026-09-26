// Service Worker: 毎日のリマインド通知を受け取り、タップでアプリを開く

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'E資格 今日の勉強', {
    body: d.body || '今日の問題に取り組もう',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'daily-reminder',
    renotify: true,
    data: { url: d.url || 'drill.html?daily=1' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || 'drill.html?daily=1', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && 'navigate' in w) {
        await w.focus();
        return w.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});
