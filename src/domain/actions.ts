import { db, getSettings, uid } from '../db/db'
import { ALL_DAYS, dateKey, minutesOf } from './dates'
import { entriesForDate, rotationAfterLog, type Entry, type PlanData } from './schedule'
import type { LogStatus, Product, Rotation, Routine, RoutineLog, Tod } from './types'

/* ---------------- logging ---------------- */

async function snapshot(routineId: string, fallbackName: string) {
  const r = await db.routines.get(routineId)
  const products = r ? await db.products.bulkGet(r.productIds) : []
  return {
    routineName: r?.name ?? fallbackName,
    productNames: products.filter((p): p is Product => !!p).map(p => p.name),
  }
}

/** Marks an entry done or skipped. For routines that take turns, done always moves the turn on; a skip only does if asked. */
export async function logEntry(entry: Entry, status: LogStatus, opts: { advance?: boolean } = {}): Promise<void> {
  await db.transaction('rw', [db.logs, db.rotations, db.routines, db.products], async () => {
    const existing = await db.logs.where('date').equals(entry.date).filter(l => l.scheduleId === entry.scheduleId).first()
    if (existing) return
    const snap = await snapshot(entry.routineId, entry.name)
    const log: RoutineLog = {
      id: uid(), date: entry.date, tod: entry.tod, routineId: entry.routineId, scheduleId: entry.scheduleId,
      rotationId: entry.rotationId, ...snap, status, at: Date.now(),
    }
    if (entry.rotationId) {
      const rot = await db.rotations.get(entry.rotationId)
      if (rot) {
        log.stepBefore = rot.currentStep
        const next = rotationAfterLog(rot, status, !!opts.advance)
        if (next !== undefined) {
          log.advanced = true
          await db.rotations.update(rot.id, { currentStep: next })
        }
      }
    }
    await db.logs.add(log)
  })
}

export async function undoLog(logId: string): Promise<void> {
  await db.transaction('rw', [db.logs, db.rotations], async () => {
    const log = await db.logs.get(logId)
    if (!log) return
    if (log.advanced && log.rotationId && log.stepBefore !== undefined) {
      await db.rotations.update(log.rotationId, { currentStep: log.stepBefore })
    }
    await db.logs.delete(logId)
  })
}

export async function setLogNote(logId: string, note: string): Promise<void> {
  await db.logs.update(logId, { note: note.trim() || undefined })
}

/* ---------------- products ---------------- */

export async function addProduct(p: Omit<Product, 'id' | 'createdAt'>): Promise<string> {
  const id = uid()
  await db.products.add({ ...p, name: p.name.trim(), id, createdAt: Date.now() })
  return id
}

export async function updateProduct(id: string, patch: Partial<Omit<Product, 'id' | 'createdAt'>>): Promise<void> {
  await db.products.update(id, patch)
}

/** Removes the product from routines going forward. Past logs keep its name. */
export async function deleteProduct(id: string): Promise<void> {
  await db.transaction('rw', [db.products, db.routines], async () => {
    const routines = await db.routines.filter(r => r.productIds.includes(id)).toArray()
    for (const r of routines) await db.routines.update(r.id, { productIds: r.productIds.filter(p => p !== id) })
    await db.products.delete(id)
  })
}

/* ---------------- routines and when they happen ---------------- */

export type ScheduleChoice =
  | { kind: 'everyday' }
  | { kind: 'days'; weekdays: number[] }
  | { kind: 'turns'; withIds: string[]; weekdays: number[] }

/** Takes a routine out of any routines it takes turns with. A group left with one routine goes back to its own schedule. */
async function leaveRotations(routineId: string, exceptRotationId?: string): Promise<void> {
  const rotations = await db.rotations.filter(r => r.routineIds.includes(routineId) && r.id !== exceptRotationId).toArray()
  for (const rot of rotations) {
    const index = rot.routineIds.indexOf(routineId)
    const remaining = rot.routineIds.filter(id => id !== routineId)
    const sched = await db.schedules.where('rotationId').equals(rot.id).first()
    if (remaining.length >= 2) {
      let step = rot.currentStep
      if (index < step) step -= 1
      await db.rotations.update(rot.id, { routineIds: remaining, currentStep: step % remaining.length })
      continue
    }
    await db.rotations.delete(rot.id)
    if (sched) await db.schedules.delete(sched.id)
    if (remaining.length === 1) {
      await db.schedules.add({
        id: uid(), type: 'weekly', routineId: remaining[0], weekdays: sched?.weekdays ?? ALL_DAYS,
        active: sched?.active ?? true, createdAt: Date.now(),
      })
    }
  }
}

export interface RoutineInput {
  id?: string
  name: string
  tod: Tod
  productIds: string[]
  tags: string[]
}

export async function saveRoutine(input: RoutineInput, choice: ScheduleChoice): Promise<string> {
  const id = input.id ?? uid()
  await db.transaction('rw', [db.routines, db.schedules, db.rotations], async () => {
    const existing = await db.routines.get(id)
    await db.routines.put({
      id, name: input.name.trim(), tod: input.tod, productIds: input.productIds,
      tags: input.tags, createdAt: existing?.createdAt ?? Date.now(),
    })

    if (choice.kind !== 'turns') {
      await leaveRotations(id)
      const weekdays = choice.kind === 'everyday' ? ALL_DAYS : choice.weekdays
      const own = await db.schedules.where('routineId').equals(id).first()
      if (own) await db.schedules.update(own.id, { weekdays })
      else await db.schedules.add({ id: uid(), type: 'weekly', routineId: id, weekdays, active: true, createdAt: Date.now() })
      return
    }

    const group = [...choice.withIds.filter(g => g !== id), id]
    let rot: Rotation | undefined = await db.rotations.filter(r => r.tod === input.tod && group.some(g => r.routineIds.includes(g))).first()
    if (!rot) rot = { id: uid(), tod: input.tod, routineIds: [], currentStep: 0, createdAt: Date.now() }
    const order = [...rot.routineIds]
    for (const g of group) {
      if (order.includes(g)) continue
      await leaveRotations(g, rot.id)
      const weeklies = await db.schedules.where('routineId').equals(g).toArray()
      await db.schedules.bulkDelete(weeklies.map(s => s.id))
      order.push(g)
    }
    await db.rotations.put({ ...rot, routineIds: order })
    const sched = await db.schedules.where('rotationId').equals(rot.id).first()
    if (sched) await db.schedules.update(sched.id, { weekdays: choice.weekdays })
    else await db.schedules.add({ id: uid(), type: 'rotation', rotationId: rot.id, weekdays: choice.weekdays, active: true, createdAt: Date.now() })
  })
  return id
}

/** Deletes the routine and its schedule. History stays. */
export async function deleteRoutine(id: string): Promise<void> {
  await db.transaction('rw', [db.routines, db.schedules, db.rotations], async () => {
    await leaveRotations(id)
    const weeklies = await db.schedules.where('routineId').equals(id).toArray()
    await db.schedules.bulkDelete(weeklies.map(s => s.id))
    await db.routines.delete(id)
  })
}

export async function setScheduleActive(scheduleId: string, active: boolean): Promise<void> {
  await db.schedules.update(scheduleId, { active })
}

/* ---------------- reading plan data ---------------- */

export async function loadPlanData(dates: string[]): Promise<PlanData> {
  const [schedules, routines, rotations, logs] = await Promise.all([
    db.schedules.toArray(), db.routines.toArray(), db.rotations.toArray(),
    db.logs.where('date').anyOf(dates).toArray(),
  ])
  return { schedules, routines, rotations, logs }
}

/* ---------------- in-app reminders ---------------- */

/** Creates today's morning and evening reminders once their time has passed. No reminder when nothing is due. */
export async function generateDueNotifications(now = new Date()): Promise<void> {
  const s = await getSettings()
  if (!s.remindersOn || !s.onboarded) return
  const date = dateKey(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const plan = await loadPlanData([date])
  const products = new Map((await db.products.toArray()).map(p => [p.id, p]))
  for (const tod of ['am', 'pm'] as const) {
    const time = tod === 'am' ? s.morningTime : s.eveningTime
    if (minutes < minutesOf(time)) continue
    const dueAt = new Date(now)
    dueAt.setHours(Math.floor(minutesOf(time) / 60), minutesOf(time) % 60, 0, 0)
    if (s.onboardedAt && dueAt.getTime() < s.onboardedAt) continue
    const id = `${date}-${tod}`
    if (await db.notifications.get(id)) continue
    const due = entriesForDate(date, plan).filter(e => e.tod === tod && e.status === 'planned')
    if (!due.length) continue
    await db.notifications.put({
      id, date, tod, time, createdAt: Date.now(), read: false,
      items: due.map(e => ({
        routineName: e.name,
        productNames: (e.routine?.productIds ?? []).map(pid => products.get(pid)?.name).filter((n): n is string => !!n),
      })),
    })
  }
}

export function routinesFor(routines: Routine[], tod: Tod): Routine[] {
  return routines.filter(r => r.tod === tod).sort((a, b) => a.createdAt - b.createdAt)
}
