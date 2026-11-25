/// <reference lib="webworker" />
/*
 * My Skin Routine service worker:
 * - lets the app open without a connection
 * - shows reminders that our server sends while the app is closed
 * - opens the right day when someone taps one
 */
import { db, getSettings } from '../db/db'
import { dateKey, fmtClock } from '../domain/dates'
import { currentReminderPlan, dueAt, recordReminder, reminderBody, reminderTitle } from '../domain/reminders'
import type { Tod } from '../domain/types'

declare const self: ServiceWorkerGlobalScope

const CACHE = 'msr-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])))
  void self.skipWaiting()
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Pages: try the network first so updates arrive, fall back to the saved app when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE)
        await cache.put('/', fresh.clone())
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
      if (res.ok) await (await caches.open(CACHE)).put(req, res.clone())
      return res
    })())
  }
})

/* ---------------- reminders from the server ---------------- */

interface PushMessage {
  date?: string
  tod?: Tod
  test?: boolean
}

function readMessage(event: PushEvent): PushMessage {
  try {
    return (event.data?.json() ?? {}) as PushMessage
  } catch {
    return {}
  }
}

const show = (title: string, body: string, tag: string, url = '/') =>
  self.registration.showNotification(title, { body, tag, data: { url, id: tag }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' })

async function handlePush(msg: PushMessage): Promise<void> {
  const s = await getSettings()
  if (msg.test) {
    return show('Phone reminders are working', `We’ll remind you at ${fmtClock(s.morningTime)} and ${fmtClock(s.eveningTime)}.`, 'test')
  }
  const tod: Tod = msg.tod === 'pm' ? 'pm' : 'am'
  const date = msg.date && /^\d{4}-\d{2}-\d{2}$/.test(msg.date) ? msg.date : dateKey(new Date())
  const id = `${date}-${tod}`
  const url = date === dateKey(new Date()) ? '/' : `/day/${date}`
  const items = await recordReminder(date, tod, tod === 'am' ? s.morningTime : s.eveningTime)
  if (items) return show(reminderTitle(tod), reminderBody(items), id, url)

  // Nothing left to do at this time. Phones expect every push to show something, so say so kindly.
  const { logged } = await dueAt(date, tod)
  const part = tod === 'am' ? 'morning' : 'evening'
  if (logged.length) return show(`Your ${part} routine is logged`, `You already logged ${logged.join(' and ')}.`, id, url)
  return show(`Nothing planned this ${part}`, 'Enjoy the rest.', id, url)
}

self.addEventListener('push', event => {
  const msg = readMessage(event)
  event.waitUntil(handlePush(msg).catch(() => show(reminderTitle(msg.tod === 'pm' ? 'pm' : 'am'), 'Open My Skin Routine to see what’s planned.', 'reminder')))
})

// Opens the right day when someone taps a reminder, and marks it as read.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: string; id?: string }
  const target = data.url || '/'
  event.waitUntil((async () => {
    if (data.id) await db.notifications.update(data.id, { read: true }).catch(() => 0)
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      await c.focus()
      await c.navigate(target).catch(() => undefined)
      return
    }
    await self.clients.openWindow(target)
  })())
})

// Some browsers renew the push subscription now and then. Tell the server about the new one.
self.addEventListener('pushsubscriptionchange', event => {
  const e = event as ExtendableEvent & { newSubscription?: PushSubscription | null }
  e.waitUntil((async () => {
    let sub = e.newSubscription ?? null
    if (!sub) {
      const res = await fetch('/api/push/key')
      if (!res.ok) return
      const { key } = (await res.json()) as { key: string }
      const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4))
      const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
    }
    await fetch('/api/push/subscription', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), plan: await currentReminderPlan() }),
    })
  })().catch(() => undefined))
})
