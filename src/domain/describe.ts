import type { ScheduleChoice } from './actions'
import { ALL_DAYS, describeDays, joinAnd } from './dates'
import type { Rotation, Routine, Schedule } from './types'

export interface RoutineSchedule {
  choice: ScheduleChoice
  scheduleId?: string
  active: boolean
  rotation?: Rotation
}

export function scheduleOf(routineId: string, schedules: Schedule[], rotations: Rotation[]): RoutineSchedule | undefined {
  const rot = rotations.find(r => r.routineIds.includes(routineId))
  if (rot) {
    const s = schedules.find(x => x.rotationId === rot.id)
    return {
      choice: { kind: 'turns', withIds: rot.routineIds.filter(id => id !== routineId), weekdays: s?.weekdays ?? ALL_DAYS },
      scheduleId: s?.id, active: s?.active ?? true, rotation: rot,
    }
  }
  const s = schedules.find(x => x.type === 'weekly' && x.routineId === routineId)
  if (!s) return undefined
  return {
    choice: s.weekdays.length === 7 ? { kind: 'everyday' } : { kind: 'days', weekdays: s.weekdays },
    scheduleId: s.id, active: s.active,
  }
}

export function describeSchedule(rs: RoutineSchedule | undefined, routines: Routine[]): string {
  if (!rs) return 'Not scheduled yet'
  const c = rs.choice
  let text: string
  if (c.kind === 'everyday') text = 'Every day'
  else if (c.kind === 'days') text = describeDays(c.weekdays)
  else {
    const names = c.withIds.map(id => routines.find(r => r.id === id)?.name).filter((n): n is string => !!n)
    text = `Takes turns with ${joinAnd(names)}`
    if (c.weekdays.length !== 7) text += `, ${describeDays(c.weekdays).toLowerCase()}`
  }
  return rs.active ? text : `${text}. Paused for now`
}
