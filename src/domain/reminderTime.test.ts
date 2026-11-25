import { describe, expect, it } from 'vitest'
import { nextSlot, parsePlan, zonedToUtc, type ReminderPlan } from './reminderTime'

const EVERY = [0, 1, 2, 3, 4, 5, 6]
const plan = (p: Partial<ReminderPlan> = {}): ReminderPlan => ({
  tz: 'Africa/Lagos', morning: '07:30', evening: '21:00', amDays: EVERY, pmDays: EVERY, handled: [], ...p,
})

describe('reminder times', () => {
  it('turns a local time into the right moment', () => {
    // Lagos is UTC+1 all year.
    expect(new Date(zonedToUtc('2026-11-25', '07:30', 'Africa/Lagos')).toISOString()).toBe('2026-11-25T06:30:00.000Z')
    // London is on winter time in November and summer time in July.
    expect(new Date(zonedToUtc('2026-11-25', '07:30', 'Europe/London')).toISOString()).toBe('2026-11-25T07:30:00.000Z')
    expect(new Date(zonedToUtc('2026-07-01', '07:30', 'Europe/London')).toISOString()).toBe('2026-07-01T06:30:00.000Z')
    // New York the morning after clocks go back (1 November 2026).
    expect(new Date(zonedToUtc('2026-11-02', '07:30', 'America/New_York')).toISOString()).toBe('2026-11-02T12:30:00.000Z')
  })

  it('finds the next morning or evening reminder', () => {
    const at = (iso: string) => new Date(iso).getTime()
    // 05:00 in Lagos: this morning is next.
    expect(nextSlot(plan(), at('2026-11-25T04:00:00Z'))).toMatchObject({ id: '2026-11-25-am', at: at('2026-11-25T06:30:00Z') })
    // 10:00 in Lagos: tonight is next.
    expect(nextSlot(plan(), at('2026-11-25T09:00:00Z'))).toMatchObject({ id: '2026-11-25-pm', at: at('2026-11-25T20:00:00Z') })
    // 22:00 in Lagos: tomorrow morning.
    expect(nextSlot(plan(), at('2026-11-25T21:00:00Z'))?.id).toBe('2026-11-26-am')
    // Exactly at the reminder time, it counts as sent and the next one is tonight.
    expect(nextSlot(plan(), at('2026-11-25T06:30:00Z'))?.id).toBe('2026-11-25-pm')
  })

  it('skips days without a routine and reminders already handled', () => {
    const at = new Date('2026-11-25T04:00:00Z').getTime() // Wednesday, 05:00 in Lagos
    // Morning done already: tonight is next.
    expect(nextSlot(plan({ handled: ['2026-11-25-am'] }), at)?.id).toBe('2026-11-25-pm')
    // Morning routines only on Saturday and Sunday, no evening routines.
    expect(nextSlot(plan({ amDays: [0, 6], pmDays: [] }), at)?.id).toBe('2026-11-28-am')
    // Nothing planned at all.
    expect(nextSlot(plan({ amDays: [], pmDays: [] }), at)).toBeUndefined()
  })

  it('handles an evening time earlier than the morning one', () => {
    const at = new Date('2026-11-25T04:00:00Z').getTime()
    expect(nextSlot(plan({ morning: '09:00', evening: '06:00' }), at)?.id).toBe('2026-11-25-pm')
  })

  it('only accepts a sensible plan', () => {
    expect(parsePlan(plan())).toEqual(plan())
    expect(parsePlan({ ...plan(), tz: 'Mars/Olympus' })).toBeUndefined()
    expect(parsePlan({ ...plan(), morning: '7:30' })).toBeUndefined()
    expect(parsePlan({ ...plan(), amDays: [7] })).toBeUndefined()
    expect(parsePlan({ ...plan(), handled: ['yesterday'] })).toBeUndefined()
    expect(parsePlan({ ...plan(), amDays: [3, 1, 1] })?.amDays).toEqual([1, 3])
  })
})
