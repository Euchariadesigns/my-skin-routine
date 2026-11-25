/*
 * Reminders, as both the app and the service worker see them.
 * This file must not touch the page (window, document), because the service worker uses it too.
 */
import { db, getSettings, loadPlanData } from '../db/db'
import { dateKey } from './dates'
import type { ReminderPlan } from './reminderTime'
import { entriesForDate } from './schedule'
import type { AppNotification, Tod } from './types'

export type ReminderItem = AppNotification['items'][number]

export const reminderTitle = (tod: Tod) => (tod === 'am' ? 'Time for your morning routine' : 'Time for your evening routine')

export function reminderBody(items: ReminderItem[]): string {
  return items.map(i => (i.productNames.length ? `${i.routineName}: ${i.productNames.join(' → ')}` : i.routineName)).join('\n')
}

/** The routines still to do at that time of day, and the names of any already logged. */
export async function dueAt(date: string, tod: Tod): Promise<{ planned: ReminderItem[]; logged: string[] }> {
  const [plan, products] = await Promise.all([loadPlanData([date]), db.products.toArray()])
  const names = new Map(products.map(p => [p.id, p.name]))
  const entries = entriesForDate(date, plan).filter(e => e.tod === tod)
  return {
    planned: entries.filter(e => e.status === 'planned').map(e => ({
      routineName: e.name,
      productNames: (e.routine?.productIds ?? []).map(id => names.get(id)).filter((n): n is string => !!n),
    })),
    logged: entries.filter(e => e.status !== 'planned').map(e => e.name),
  }
}

/**
 * Adds the reminder to the Alerts list, once. Returns what it lists,
 * or nothing when nothing is planned at that time any more.
 */
export async function recordReminder(date: string, tod: Tod, time: string): Promise<ReminderItem[] | undefined> {
  const id = `${date}-${tod}`
  const existing = await db.notifications.get(id)
  if (existing) return existing.items
  const { planned } = await dueAt(date, tod)
  if (!planned.length) return undefined
  await db.notifications.put({ id, date, tod, time, createdAt: Date.now(), read: false, items: planned })
  return planned
}

function phoneTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

/**
 * What the reminder server needs: times, time zone, and the weekdays that have a routine.
 * Today's reminders are marked as handled once nothing is left to do at that time.
 * Never any product or routine names.
 */
export async function currentReminderPlan(now = new Date()): Promise<ReminderPlan> {
  const today = dateKey(now)
  const [s, schedules, routines, rotations, todayPlan] = await Promise.all([
    getSettings(), db.schedules.toArray(), db.routines.toArray(), db.rotations.toArray(), loadPlanData([today]),
  ])
  const routineTod = new Map(routines.map(r => [r.id, r.tod]))
  const rotationTod = new Map(rotations.map(r => [r.id, r.tod]))
  const days = { am: new Set<number>(), pm: new Set<number>() }
  for (const sched of schedules) {
    if (!sched.active) continue
    const tod = sched.type === 'weekly' ? routineTod.get(sched.routineId ?? '') : rotationTod.get(sched.rotationId ?? '')
    if (tod) for (const d of sched.weekdays) days[tod].add(d)
  }
  const entries = entriesForDate(today, todayPlan)
  const handled = (['am', 'pm'] as const)
    .filter(tod => !entries.some(e => e.tod === tod && e.status === 'planned'))
    .map(tod => `${today}-${tod}`)
  return {
    tz: phoneTimeZone(s.timezone),
    morning: s.morningTime,
    evening: s.eveningTime,
    amDays: [...days.am].sort(),
    pmDays: [...days.pm].sort(),
    handled,
  }
}
