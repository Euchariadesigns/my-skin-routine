/*
 * When reminders are due, worked out from a phone's own time zone.
 * Shared by the app (which sends its plan) and the reminder server (which wakes up at each time).
 * Only times, a time zone and weekdays are involved. Nothing about products or routines.
 */

export type ReminderTod = 'am' | 'pm'

export interface ReminderPlan {
  /** The phone's time zone, like "Africa/Lagos". */
  tz: string
  /** "07:30" */
  morning: string
  /** "21:00" */
  evening: string
  /** Weekdays (0 is Sunday) with a morning routine planned. */
  amDays: number[]
  /** Weekdays (0 is Sunday) with an evening routine planned. */
  pmDays: number[]
  /** Reminders that aren't needed any more, like "2026-11-25-am" once the morning routine is logged. */
  handled: string[]
}

export interface ReminderSlot {
  /** When the reminder is due, in milliseconds since 1970 (UTC). */
  at: number
  /** The phone's local date, "2026-11-25". */
  date: string
  tod: ReminderTod
  /** "2026-11-25-am" */
  id: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const SLOT = /^\d{4}-\d{2}-\d{2}-(am|pm)$/

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    formatter(tz)
    return true
  } catch {
    return false
  }
}

/** The wall clock in `tz` at instant `ms`. */
function wallClock(ms: number, tz: string) {
  const parts: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return { y: parts.year, m: parts.month, d: parts.day, hh: parts.hour, mm: parts.minute, ss: parts.second }
}

/** How far `tz` is ahead of UTC at instant `ms`, in milliseconds. */
function offsetAt(ms: number, tz: string): number {
  const w = wallClock(ms, tz)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** The instant when the clock in `tz` shows `date` at `hhmm`. */
export function zonedToUtc(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const local = Date.UTC(y, m - 1, d, hh, mm)
  let at = local - offsetAt(local, tz)
  const settled = offsetAt(at, tz)
  if (local - settled !== at) at = local - settled
  return at
}

/** The phone's local date at instant `ms`, "2026-11-25". */
export function zonedDate(ms: number, tz: string): string {
  const w = wallClock(ms, tz)
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`
}

function shiftDate(date: string, days: number): { date: string; weekday: number } {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
  return { date: key, weekday: t.getUTCDay() }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The first reminder due strictly after `after`, or nothing if no routine is planned on any day. */
export function nextSlot(plan: ReminderPlan, after: number): ReminderSlot | undefined {
  if (!plan.amDays.length && !plan.pmDays.length) return undefined
  const handled = new Set(plan.handled)
  const times = ([['am', plan.morning, plan.amDays], ['pm', plan.evening, plan.pmDays]] as const)
    .slice()
    .sort((a, b) => minutes(a[1]) - minutes(b[1]))
  // Start a day early so a late time zone change can't skip today.
  const start = zonedDate(after, plan.tz)
  for (let i = -1; i <= 8; i++) {
    const { date, weekday } = shiftDate(start, i)
    for (const [tod, time, days] of times) {
      if (!days.includes(weekday)) continue
      const id = `${date}-${tod}`
      if (handled.has(id)) continue
      const at = zonedToUtc(date, time, plan.tz)
      if (at > after) return { at, date, tod, id }
    }
  }
  return undefined
}

function weekdays(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length > 7) return undefined
  if (!v.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return undefined
  return [...new Set(v as number[])].sort()
}

/** Checks a plan sent by a phone. Returns it cleaned up, or nothing if anything looks wrong. */
export function parsePlan(v: unknown): ReminderPlan | undefined {
  if (!v || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  const amDays = weekdays(p.amDays), pmDays = weekdays(p.pmDays)
  if (!isTimeZone(p.tz) || !amDays || !pmDays) return undefined
  if (typeof p.morning !== 'string' || !TIME.test(p.morning)) return undefined
  if (typeof p.evening !== 'string' || !TIME.test(p.evening)) return undefined
  const handled = p.handled ?? []
  if (!Array.isArray(handled) || handled.length > 8 || !handled.every(h => typeof h === 'string' && SLOT.test(h))) return undefined
  return { tz: p.tz, morning: p.morning, evening: p.evening, amDays, pmDays, handled: handled as string[] }
}
