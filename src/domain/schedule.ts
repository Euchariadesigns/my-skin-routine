import { weekdayOf } from './dates'
import type { LogStatus, Rotation, Routine, RoutineLog, Schedule, Tod } from './types'

/** Everything the planner needs for one day. Pure data, no database. */
export interface PlanData {
  schedules: Schedule[]
  routines: Routine[]
  rotations: Rotation[]
  logs: RoutineLog[]
}

export type EntryStatus = 'planned' | LogStatus

/** One routine due (or logged) at one time of one day. */
export interface Entry {
  key: string
  date: string
  tod: Tod
  scheduleId: string
  rotationId?: string
  routineId: string
  /** Undefined when the routine has since been deleted; the log snapshot is used instead. */
  routine?: Routine
  name: string
  status: EntryStatus
  log?: RoutineLog
}

export function rotationRoutineId(rot: Rotation): string | undefined {
  const n = rot.routineIds.length
  if (!n) return undefined
  return rot.routineIds[((rot.currentStep % n) + n) % n]
}

export function stepAfter(rot: Rotation, step = rot.currentStep): number {
  const n = rot.routineIds.length
  return n ? (step + 1) % n : 0
}

/**
 * What's due on a date, plus anything already logged that day.
 * A logged entry always shows the routine it was logged as, even if the rotation has moved on since.
 */
export function entriesForDate(date: string, data: PlanData): Entry[] {
  const routines = new Map(data.routines.map(r => [r.id, r]))
  const rotations = new Map(data.rotations.map(r => [r.id, r]))
  const dayLogs = data.logs.filter(l => l.date === date)
  const usedLogs = new Set<string>()
  const weekday = weekdayOf(date)
  const out: Entry[] = []

  const schedules = [...data.schedules].sort((a, b) => a.createdAt - b.createdAt)
  for (const s of schedules) {
    const log = dayLogs.find(l => l.scheduleId === s.id)
    const due = s.active && s.weekdays.includes(weekday)
    if (!due && !log) continue
    if (log) usedLogs.add(log.id)

    if (s.type === 'weekly') {
      const routine = s.routineId ? routines.get(s.routineId) : undefined
      if (!log && !routine) continue
      out.push({
        key: `${date}:${s.id}`,
        date,
        tod: log?.tod ?? routine!.tod,
        scheduleId: s.id,
        routineId: log?.routineId ?? routine!.id,
        routine: log ? routines.get(log.routineId) : routine,
        name: log?.routineName ?? routine!.name,
        status: log?.status ?? 'planned',
        log,
      })
    } else {
      const rot = s.rotationId ? rotations.get(s.rotationId) : undefined
      const routineId = log?.routineId ?? (rot ? rotationRoutineId(rot) : undefined)
      const routine = routineId ? routines.get(routineId) : undefined
      if (!log && (!rot || !routine)) continue
      out.push({
        key: `${date}:${s.id}`,
        date,
        tod: log?.tod ?? routine!.tod,
        scheduleId: s.id,
        rotationId: s.rotationId,
        routineId: routineId!,
        routine,
        name: log?.routineName ?? routine!.name,
        status: log?.status ?? 'planned',
        log,
      })
    }
  }

  // Logs whose schedule was later removed still belong to the day's history.
  for (const log of dayLogs) {
    if (usedLogs.has(log.id)) continue
    out.push({
      key: `${date}:log:${log.id}`,
      date,
      tod: log.tod,
      scheduleId: log.scheduleId,
      rotationId: log.rotationId,
      routineId: log.routineId,
      routine: routines.get(log.routineId),
      name: log.routineName,
      status: log.status,
      log,
    })
  }
  return out
}

export function splitByTod(entries: Entry[]): { am: Entry[]; pm: Entry[] } {
  return { am: entries.filter(e => e.tod === 'am'), pm: entries.filter(e => e.tod === 'pm') }
}

/**
 * The day runs morning, then evening, then the next morning.
 * Once every morning routine is done or skipped, the first evening routine still to do is up next.
 * Once the evening is done or skipped too, tomorrow morning is up next.
 */
export function upNext(am: Entry[], pm: Entry[]): { upNextKey?: string; showTomorrow: boolean } {
  const amOpen = am.some(e => e.status === 'planned')
  const pmOpen = pm.some(e => e.status === 'planned')
  const upNextKey = !amOpen && am.length > 0 ? pm.find(e => e.status === 'planned')?.key : undefined
  const showTomorrow = !amOpen && !pmOpen && am.length + pm.length > 0
  return { upNextKey, showTomorrow }
}

/**
 * Products that aren't in every routine for that time of day.
 * These make a routine different from the others, so they get highlighted.
 */
export function distinctProducts(routine: Routine, all: Routine[]): string[] {
  const peers = all.filter(r => r.tod === routine.tod)
  if (peers.length < 2) return []
  return routine.productIds.filter(id => !peers.every(r => r.productIds.includes(id)))
}

/** The most recent completed log matching a filter, optionally before a date. */
export function lastDone(logs: RoutineLog[], match: (l: RoutineLog) => boolean, before?: string): RoutineLog | undefined {
  return logs
    .filter(l => l.status === 'done' && match(l) && (!before || l.date < before))
    .sort((a, b) => b.at - a.at)[0]
}

/** The rotation state after logging an entry. Undefined when the turn doesn't move. */
export function rotationAfterLog(rot: Rotation, status: LogStatus, advanceOnSkip: boolean): number | undefined {
  if (status === 'done' || advanceOnSkip) return stepAfter(rot)
  return undefined
}
