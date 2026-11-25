export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
/** Monday first, the way most people read a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayKey = (now = new Date()) => dateKey(now)

export function addDays(key: string, n: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

export const weekdayOf = (key: string) => parseKey(key).getDay()

/** Days from a to b (b - a), using local calendar days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000)
}

export function fmtTime(at: number | Date): string {
  const d = typeof at === 'number' ? new Date(at) : at
  return fmtHM(d.getHours(), d.getMinutes())
}

function fmtHM(h: number, m: number): string {
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`
}

/** "07:30" → "7:30 am" */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return fmtHM(h, m)
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function dayLabel(key: string, today: string): string {
  const diff = daysBetween(today, key)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return WEEKDAYS[weekdayOf(key)]
}

export function longDate(key: string): string {
  const d = parseKey(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function joinAnd(list: string[]): string {
  if (list.length < 2) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export function describeDays(weekdays: number[]): string {
  const set = [...new Set(weekdays)]
  if (set.length === 7) return 'Every day'
  if (set.length === 0) return 'No days chosen'
  const weekdaysOnly = [1, 2, 3, 4, 5]
  if (set.length === 5 && weekdaysOnly.every(d => set.includes(d))) return 'Every weekday'
  if (set.length === 2 && set.includes(0) && set.includes(6)) return 'Every weekend'
  return `Every ${joinAnd(WEEK_ORDER.filter(d => set.includes(d)).map(d => WEEKDAYS[d]))}`
}

export function partOfDay(now = new Date()): 'this morning' | 'today' | 'tonight' {
  const h = now.getHours()
  return h < 12 ? 'this morning' : h < 17 ? 'today' : 'tonight'
}
