import Dexie, { type EntityTable } from 'dexie'
import type { PlanData } from '../domain/schedule'
import type { AppNotification, Product, Rotation, Routine, RoutineLog, Schedule, Settings } from '../domain/types'

/** Everything lives on the person's phone, in IndexedDB. */
export const db = new Dexie('my-skin-routine') as Dexie & {
  products: EntityTable<Product, 'id'>
  routines: EntityTable<Routine, 'id'>
  schedules: EntityTable<Schedule, 'id'>
  rotations: EntityTable<Rotation, 'id'>
  logs: EntityTable<RoutineLog, 'id'>
  notifications: EntityTable<AppNotification, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  products: 'id, createdAt',
  routines: 'id, tod, createdAt',
  schedules: 'id, routineId, rotationId, createdAt',
  rotations: 'id, tod',
  logs: 'id, date, routineId, scheduleId, rotationId, at',
  notifications: 'id, date, createdAt',
  settings: 'id',
})

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultSettings(): Settings {
  let timezone = 'UTC'
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { /* keep UTC */ }
  return { id: 'me', name: '', morningTime: '07:30', eveningTime: '21:00', remindersOn: true, pushOn: false, onboarded: false, timezone }
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('me')) ?? defaultSettings()
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'me' })
}

/** Everything needed to work out what's planned on these dates. */
export async function loadPlanData(dates: string[]): Promise<PlanData> {
  const [schedules, routines, rotations, logs] = await Promise.all([
    db.schedules.toArray(), db.routines.toArray(), db.rotations.toArray(),
    db.logs.where('date').anyOf(dates).toArray(),
  ])
  return { schedules, routines, rotations, logs }
}
