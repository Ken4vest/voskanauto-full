// ============================================================
// SERVICE WORKER — ПУШ-УВЕДОМЛЕНИЯ
// ============================================================

const CACHE_NAME = 'voskanauto-v1';
const STATIC_ASSETS = [
  '/',
  '/css/dark-theme.css',
  '/js/app-enhancements.js',
  '/img/logo.png'
];

// Установка
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Активация
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Пуш-уведомление
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'ВосканАвто', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Новое уведомление',
    icon: '/img/logo.png',
    badge: '/img/badge.png',
    tag: data.tag || 'default',
    data: data.url || '/',
    requireInteraction: true,
    actions: data.actions || [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ВосканАвто', options)
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const url = event.notification.data || '/';

  if (action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Фоновая синхронизация (для офлайн-форм)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-forms') {
    event.waitUntil(syncForms());
  }
});

async function syncForms() {
  // Синхронизация сохранённых в IndexedDB форм
  console.log('Синхронизация форм...');
}
