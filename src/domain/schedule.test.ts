import { describe, expect, it } from 'vitest'
import { addDays, describeDays, dayLabel, fmtClock, weekdayOf } from './dates'
import { distinctProducts, entriesForDate, lastDone, rotationAfterLog, rotationRoutineId, splitByTod, upNext, type PlanData } from './schedule'
import type { Rotation, Routine, RoutineLog, Schedule } from './types'

const WED = '2026-11-25' // a Wednesday
const routine = (id: string, tod: 'am' | 'pm', productIds: string[], createdAt = 1): Routine => ({ id, name: `${id} name`, tod, productIds, tags: [], createdAt })
const weekly = (id: string, routineId: string, weekdays: number[], createdAt = 1, active = true): Schedule => ({ id, type: 'weekly', routineId, weekdays, active, createdAt })
const rotSched = (id: string, rotationId: string, weekdays = [0, 1, 2, 3, 4, 5, 6], createdAt = 1): Schedule => ({ id, type: 'rotation', rotationId, weekdays, active: true, createdAt })
const rotation = (id: string, routineIds: string[], currentStep = 0): Rotation => ({ id, tod: 'am', routineIds, currentStep, createdAt: 1 })
const log = (p: Partial<RoutineLog> & Pick<RoutineLog, 'routineId' | 'scheduleId' | 'status'>): RoutineLog => ({
  id: `log-${p.routineId}-${p.date ?? WED}`, date: WED, tod: 'am', routineName: `${p.routineId} name`, productNames: [], at: 1000, ...p,
})

const arcwell = routine('arcwell', 'am', ['wash', 'arcwell', 'spf'])
const nimbosin = routine('nimbosin', 'am', ['wash', 'nimbosin', 'spf'])
const exfoliating = routine('exfoliating', 'pm', ['wash', 'lactic'], 2)

function data(over: Partial<PlanData> = {}): PlanData {
  return {
    routines: [arcwell, nimbosin, exfoliating],
    rotations: [rotation('mornings', ['arcwell', 'nimbosin'])],
    schedules: [rotSched('s-morning', 'mornings'), weekly('s-evening', 'exfoliating', [3, 6], 2)],
    logs: [],
    ...over,
  }
}

describe('dates', () => {
  it('knows the weekday of a date key', () => {
    expect(weekdayOf(WED)).toBe(3)
    expect(addDays(WED, 7)).toBe('2026-12-02')
  })
  it('describes days the way a person would', () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(describeDays([3, 6])).toBe('Every Wednesday and Saturday')
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Every weekday')
    expect(dayLabel(addDays(WED, -1), WED)).toBe('Yesterday')
    expect(fmtClock('21:00')).toBe('9:00 pm')
  })
})

describe('what is due on a day', () => {
  it('shows the current turn of a rotation and weekly routines on their days', () => {
    const entries = entriesForDate(WED, data())
    expect(entries.map(e => [e.name, e.tod, e.status])).toEqual([
      ['arcwell name', 'am', 'planned'],
      ['exfoliating name', 'pm', 'planned'],
    ])
    // Thursday: no evening routine
    expect(entriesForDate(addDays(WED, 1), data()).map(e => e.routineId)).toEqual(['arcwell'])
  })

  it('shows what was logged, even after the rotation moved on', () => {
    const d = data({
      rotations: [rotation('mornings', ['arcwell', 'nimbosin'], 1)],
      logs: [log({ routineId: 'arcwell', scheduleId: 's-morning', rotationId: 'mornings', status: 'done', stepBefore: 0, advanced: true })],
    })
    const [am] = entriesForDate(WED, d)
    expect(am.routineId).toBe('arcwell')
    expect(am.status).toBe('done')
    // Tomorrow is the next turn
    expect(entriesForDate(addDays(WED, 1), d)[0].routineId).toBe('nimbosin')
  })

  it('leaves paused schedules out but keeps their history', () => {
    const paused = data({ schedules: [weekly('s-evening', 'exfoliating', [3], 1, false)] })
    expect(entriesForDate(WED, paused)).toEqual([])
    const withLog = data({
      schedules: [weekly('s-evening', 'exfoliating', [3], 1, false)],
      logs: [log({ routineId: 'exfoliating', scheduleId: 's-evening', tod: 'pm', status: 'done' })],
    })
    expect(entriesForDate(WED, withLog).map(e => e.status)).toEqual(['done'])
  })

  it('keeps logs of deleted routines, using the saved name', () => {
    const d = data({
      routines: [nimbosin, exfoliating],
      schedules: [],
      logs: [log({ routineId: 'gone', routineName: 'Old routine', scheduleId: 'old', status: 'done' })],
    })
    const [e] = entriesForDate(WED, d)
    expect(e.name).toBe('Old routine')
    expect(e.routine).toBeUndefined()
  })
})

describe('taking turns', () => {
  const rot = rotation('mornings', ['arcwell', 'nimbosin'])
  it('moves on when completed', () => {
    expect(rotationAfterLog(rot, 'done', false)).toBe(1)
    expect(rotationRoutineId({ ...rot, currentStep: 1 })).toBe('nimbosin')
    expect(rotationAfterLog({ ...rot, currentStep: 1 }, 'done', false)).toBe(0)
  })
  it('only moves on after a skip if the person says so', () => {
    expect(rotationAfterLog(rot, 'skipped', false)).toBeUndefined()
    expect(rotationAfterLog(rot, 'skipped', true)).toBe(1)
  })
  it('never moves on for a missed day, because nothing was logged', () => {
    const d = data()
    expect(entriesForDate(addDays(WED, 1), d)[0].routineId).toBe('arcwell')
  })
})

describe('up next', () => {
  it('is the evening once the morning is done', () => {
    const d = data({ logs: [log({ routineId: 'arcwell', scheduleId: 's-morning', status: 'done' })] })
    const { am, pm } = splitByTod(entriesForDate(WED, d))
    expect(upNext(am, pm)).toEqual({ upNextKey: pm[0].key, showTomorrow: false })
  })
  it('is the evening after a skipped morning too', () => {
    const d = data({ logs: [log({ routineId: 'arcwell', scheduleId: 's-morning', status: 'skipped' })] })
    const { am, pm } = splitByTod(entriesForDate(WED, d))
    expect(upNext(am, pm).upNextKey).toBe(pm[0].key)
  })
  it('is tomorrow morning once the evening is done', () => {
    const d = data({
      logs: [
        log({ routineId: 'arcwell', scheduleId: 's-morning', status: 'done' }),
        log({ routineId: 'exfoliating', scheduleId: 's-evening', tod: 'pm', status: 'done' }),
      ],
    })
    const { am, pm } = splitByTod(entriesForDate(WED, d))
    expect(upNext(am, pm)).toEqual({ upNextKey: undefined, showTomorrow: true })
  })
  it('is nothing while the morning is still to do', () => {
    const { am, pm } = splitByTod(entriesForDate(WED, data()))
    expect(upNext(am, pm)).toEqual({ upNextKey: undefined, showTomorrow: false })
  })
})

describe('highlights and history', () => {
  it('highlights the products that make a routine different', () => {
    expect(distinctProducts(arcwell, [arcwell, nimbosin, exfoliating])).toEqual(['arcwell'])
    expect(distinctProducts(exfoliating, [arcwell, nimbosin, exfoliating])).toEqual([])
  })
  it('finds the last time something was done', () => {
    const logs = [
      log({ id: 'a', routineId: 'nimbosin', scheduleId: 's', status: 'done', date: '2026-11-24', at: 10 }),
      log({ id: 'b', routineId: 'arcwell', scheduleId: 's', status: 'skipped', date: '2026-11-25', at: 20 }),
    ]
    expect(lastDone(logs, () => true)?.routineId).toBe('nimbosin')
    expect(lastDone(logs, () => true, '2026-11-24')).toBeUndefined()
  })
})
