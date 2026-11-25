/*
 * The reminder server. Everything else (the app itself) is static files served by Cloudflare.
 *
 * A phone that turns on phone reminders sends its push subscription and its reminder plan:
 * time zone, morning and evening times, which weekdays have a routine, and which of today's
 * reminders are no longer needed. No product or routine names ever reach us.
 *
 * One Durable Object keeps that list in SQLite and sets an alarm for the next reminder due.
 * The push only says "morning of 2026-11-25"; the phone fills in the routine from its own data.
 */
import { DurableObject } from 'cloudflare:workers'
import { nextSlot, parsePlan, type ReminderPlan } from '../src/domain/reminderTime'
import { generateVapidKeys, importVapid, sendPush, type PushTarget, type StoredVapidKeys, type Vapid } from './webpush'

/** Push services used by Safari, Chrome, Firefox, Edge and Samsung Internet. */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/]
/** A reminder that's more than this late (say, after an outage) is dropped rather than sent. */
const TOO_LATE = 30 * 60_000
/** Workers can make 50 outgoing requests per run; leave some room. */
const BATCH = 40
const MAX_PHONES = 5000

interface SubRow extends Record<string, SqlStorageValue> {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  plan: string
  next_at: number | null
  next_slot: string | null
  tested_at: number | null
}

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export class Reminders extends DurableObject<Env> {
  private sql: SqlStorage
  private vapid?: Promise<Vapid>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`CREATE TABLE IF NOT EXISTS subs (
      id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      plan TEXT NOT NULL, next_at INTEGER, next_slot TEXT, tested_at INTEGER, updated_at INTEGER NOT NULL)`)
    this.sql.exec('CREATE INDEX IF NOT EXISTS subs_next ON subs(next_at)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
  }

  /** Our VAPID keys, made the first time they're needed and kept from then on. */
  private keys(): Promise<Vapid> {
    this.vapid ??= (async () => {
      const read = () => this.sql.exec<{ v: string }>("SELECT v FROM config WHERE k = 'vapid'").toArray()[0]
      if (!read()) {
        const fresh = await generateVapidKeys()
        this.sql.exec("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)", JSON.stringify(fresh))
      }
      const stored = JSON.parse(read()!.v) as StoredVapidKeys
      return importVapid(stored, this.env.PUSH_CONTACT)
    })()
    this.vapid.catch(() => { this.vapid = undefined })
    return this.vapid
  }

  async publicKey(): Promise<string> {
    return (await this.keys()).publicKey
  }

  async upsert(target: PushTarget, plan: ReminderPlan): Promise<void> {
    const id = await sha256(target.endpoint)
    const exists = this.sql.exec('SELECT 1 FROM subs WHERE id = ?', id).toArray().length > 0
    if (!exists) {
      const { n } = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM subs').one()
      if (n >= MAX_PHONES) throw new Error('full')
    }
    const next = nextSlot(plan, Date.now())
    this.sql.exec(
      `INSERT INTO subs (id, endpoint, p256dh, auth, plan, next_at, next_slot, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, plan = excluded.plan,
         next_at = excluded.next_at, next_slot = excluded.next_slot, updated_at = excluded.updated_at`,
      id, target.endpoint, target.p256dh, target.auth, JSON.stringify(plan), next?.at ?? null, next?.id ?? null, Date.now(),
    )
    await this.reschedule()
  }

  async remove(endpoint: string): Promise<void> {
    this.sql.exec('DELETE FROM subs WHERE id = ?', await sha256(endpoint))
    await this.reschedule()
  }

  /** Sends a sample reminder right away, so people can see it works. At most once every 20 seconds. */
  async test(endpoint: string): Promise<'sent' | 'unknown' | 'wait' | 'failed'> {
    const id = await sha256(endpoint)
    const row = this.sql.exec<SubRow>('SELECT * FROM subs WHERE id = ?', id).toArray()[0]
    if (!row) return 'unknown'
    if (row.tested_at && Date.now() - row.tested_at < 20_000) return 'wait'
    this.sql.exec('UPDATE subs SET tested_at = ? WHERE id = ?', Date.now(), id)
    const res = await this.push(row, { test: true }, 'test')
    return res === 'ok' ? 'sent' : 'failed'
  }

  private async push(row: SubRow, message: object, topic: string): Promise<'ok' | 'gone' | 'failed'> {
    try {
      const res = await sendPush(row, JSON.stringify(message), await this.keys(), { ttl: 3 * 3600, urgency: 'high', topic })
      if (res.ok) return 'ok'
      const detail = (await res.text()).slice(0, 200)
      if (res.status === 404 || res.status === 410) {
        this.sql.exec('DELETE FROM subs WHERE id = ?', row.id)
        return 'gone'
      }
      console.warn('push refused', res.status, new URL(row.endpoint).host, detail)
      return 'failed'
    } catch (err) {
      console.warn('push failed', new URL(row.endpoint).host, String(err))
      return 'failed'
    }
  }

  private async reschedule(): Promise<void> {
    const { t } = this.sql.exec<{ t: number | null }>('SELECT MIN(next_at) AS t FROM subs').one()
    if (t == null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(t, Date.now()))
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    const due = this.sql.exec<SubRow>('SELECT * FROM subs WHERE next_at <= ? ORDER BY next_at LIMIT ?', now + 1000, BATCH).toArray()
    await Promise.all(due.map(async row => {
      const [date, tod] = [row.next_slot!.slice(0, 10), row.next_slot!.slice(11)]
      if (now - row.next_at! < TOO_LATE) {
        if ((await this.push(row, { date, tod }, tod)) === 'gone') return
      }
      const next = nextSlot(JSON.parse(row.plan) as ReminderPlan, Math.max(now, row.next_at!))
      this.sql.exec('UPDATE subs SET next_at = ?, next_slot = ? WHERE id = ?', next?.at ?? null, next?.id ?? null, row.id)
    }))
    await this.reschedule()
  }
}

/* ---------------- the small web API the app talks to ---------------- */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

function isLocal(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

/** A push subscription as `PushSubscription.toJSON()` gives it, from a real push service. */
function parseTarget(v: unknown, local: boolean): PushTarget | undefined {
  if (!v || typeof v !== 'object') return undefined
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 1024) return undefined
  if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return undefined
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(s.keys.auth)) return undefined
  let url: URL
  try { url = new URL(s.endpoint) } catch { return undefined }
  const known = url.protocol === 'https:' && PUSH_HOSTS.some(h => h.test(url.hostname))
  // While testing on this computer, a pretend push service on localhost is fine too.
  if (!known && !(local && isLocal(url))) return undefined
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }
}

async function readBody(req: Request): Promise<Record<string, unknown> | undefined> {
  const text = await req.text()
  if (text.length > 4096) return undefined
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : undefined
  } catch {
    return undefined
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    const reminders = env.REMINDERS.get(env.REMINDERS.idFromName('main'))
    try {
      if (url.pathname === '/api/push/key' && req.method === 'GET') {
        return json({ key: await reminders.publicKey() })
      }
      if (!url.pathname.startsWith('/api/push/')) return json({ error: 'Not found' }, 404)
      // Changes only come from our own pages.
      if (req.headers.get('Origin') !== url.origin) return json({ error: 'Not allowed' }, 403)
      const body = await readBody(req)
      if (!body) return json({ error: 'Bad request' }, 400)
      const target = parseTarget(body.subscription, isLocal(url))
      if (!target) return json({ error: 'Bad subscription' }, 400)

      if (url.pathname === '/api/push/subscription' && req.method === 'PUT') {
        const plan = parsePlan(body.plan)
        if (!plan) return json({ error: 'Bad plan' }, 400)
        await reminders.upsert(target, plan)
        return json({ ok: true })
      }
      if (url.pathname === '/api/push/subscription' && req.method === 'DELETE') {
        await reminders.remove(target.endpoint)
        return json({ ok: true })
      }
      if (url.pathname === '/api/push/test' && req.method === 'POST') {
        const result = await reminders.test(target.endpoint)
        return json({ result }, result === 'sent' ? 200 : result === 'unknown' ? 404 : result === 'wait' ? 429 : 502)
      }
      return json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error('reminder api error', String(err))
      return json({ error: 'Something went wrong' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
