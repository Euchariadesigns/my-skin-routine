/*
 * Phone reminders while the app is closed.
 * The phone subscribes to push, then tells our reminder server its plan (times, time zone, weekdays).
 * The server wakes the phone at each reminder time; the service worker fills in the routine.
 */
import { updateSettings } from '../db/db'
import { currentReminderPlan } from '../domain/reminders'
import { askForPhoneReminders } from './notify'

const STORE = 'msr-push'
/** Send the plan again at least this often, in case the server lost it. */
const REFRESH = 12 * 3600_000

interface Synced {
  body: string
  at: number
}

function readSynced(): Synced | undefined {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Synced) : undefined
  } catch {
    return undefined
  }
}

function writeSynced(v: Synced | undefined): void {
  try {
    if (v) localStorage.setItem(STORE, JSON.stringify(v))
    else localStorage.removeItem(STORE)
  } catch { /* private mode; we'll just sync again */ }
}

/** Whether our server is sending this phone its reminders. */
export function serverRemindersOn(): boolean {
  return !!readSynced()
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  const timeout = new Promise<undefined>(r => window.setTimeout(() => r(undefined), 5000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const x = new Uint8Array(a)
  return x.every((v, i) => v === b[i])
}

async function api(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: true,
  })
}

/** This phone's push subscription, made if needed. Only works once notifications are allowed. */
async function subscription(): Promise<PushSubscription | undefined> {
  if (!pushSupported() || Notification.permission !== 'granted') return undefined
  const reg = await registration()
  if (!reg) return undefined
  const res = await api('/api/push/key', 'GET')
  if (!res.ok) return undefined
  const key = fromB64u(((await res.json()) as { key: string }).key)
  let sub = await reg.pushManager.getSubscription()
  // If the server's key ever changed, the old subscription can't be used. Some browsers don't say which key it has.
  const current = sub?.options?.applicationServerKey
  if (sub && current !== undefined && !sameKey(current, key)) {
    await sub.unsubscribe()
    sub = null
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

let queue: Promise<boolean> = Promise.resolve(true)

/** Tells the server this phone's current plan, if anything changed. Returns whether the server has it. */
export function syncServerReminders(force = false): Promise<boolean> {
  // One at a time, so a second call sees what the first one sent.
  const run = () => sync(force)
  queue = queue.then(run, run)
  return queue
}

async function sync(force: boolean): Promise<boolean> {
  try {
    const sub = await subscription()
    if (!sub) return false
    const body = JSON.stringify({ subscription: sub.toJSON(), plan: await currentReminderPlan() })
    const last = readSynced()
    if (!force && last?.body === body && Date.now() - last.at < REFRESH) return true
    const res = await api('/api/push/subscription', 'PUT', JSON.parse(body))
    if (!res.ok) return false
    writeSynced({ body, at: Date.now() })
    return true
  } catch {
    return false
  }
}

/** Stops reminders from the server for this phone. */
export async function stopServerReminders(): Promise<void> {
  if (!readSynced()) return
  try {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await api('/api/push/subscription', 'DELETE', { subscription: sub.toJSON() })
      await sub.unsubscribe()
    }
  } catch { /* offline; the server drops it when the phone stops answering */ }
  writeSynced(undefined)
}

/** Asks for permission, then sets up reminders from the server straight away. */
export async function turnOnPhoneReminders(): Promise<boolean> {
  const granted = await askForPhoneReminders()
  if (!granted) return false
  await updateSettings({ pushOn: true })
  await syncServerReminders(true)
  return true
}

export async function turnOffPhoneReminders(): Promise<void> {
  await updateSettings({ pushOn: false })
  await stopServerReminders()
}

/** Sends a sample reminder to this phone right now. */
export async function sendTestReminder(): Promise<'sent' | 'wait' | 'failed'> {
  try {
    if (!(await syncServerReminders(true))) return 'failed'
    const sub = await (await registration())?.pushManager.getSubscription()
    if (!sub) return 'failed'
    const res = await api('/api/push/test', 'POST', { subscription: sub.toJSON() })
    return res.ok ? 'sent' : res.status === 429 ? 'wait' : 'failed'
  } catch {
    return 'failed'
  }
}
