/* My Skin Routine service worker: lets the app open without a connection, and shows reminders. */
const CACHE = 'msr-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Pages: try the network first so updates arrive, fall back to the saved app when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put('/', fresh.clone())
        return fresh
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  // Built files have a unique name per version, so a saved copy is always right.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    })())
  }
})

// Opens the right day when someone taps a reminder.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) {
        await c.focus()
        if ('navigate' in c) await c.navigate(target)
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
