export type Tod = 'am' | 'pm'

export interface Product {
  id: string
  /** Exactly as the person typed it. Never changed or guessed by the app. */
  name: string
  category?: string
  note?: string
  photo?: Blob
  /** True when the photo has a transparent background (a cut-out), so it shows as a die-cut sticker. */
  cutout?: boolean
  createdAt: number
}

export interface Routine {
  id: string
  name: string
  tod: Tod
  /** Products in the order the person uses them. */
  productIds: string[]
  tags: string[]
  createdAt: number
}

/**
 * When something is due. A weekly schedule points at one routine.
 * A rotation schedule points at a rotation, whose routines take turns.
 */
export interface Schedule {
  id: string
  type: 'weekly' | 'rotation'
  routineId?: string
  rotationId?: string
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[]
  active: boolean
  createdAt: number
}

/** Routines that take turns. currentStep is the one that's due next. */
export interface Rotation {
  id: string
  tod: Tod
  routineIds: string[]
  currentStep: number
  createdAt: number
}

export type LogStatus = 'done' | 'skipped'

export interface RoutineLog {
  id: string
  /** Local date, YYYY-MM-DD */
  date: string
  tod: Tod
  routineId: string
  scheduleId: string
  rotationId?: string
  /** Snapshots, so editing a routine or product later never rewrites history. */
  routineName: string
  productNames: string[]
  status: LogStatus
  at: number
  /** For rotations: the step before this log, and whether this log moved the turn on. */
  stepBefore?: number
  advanced?: boolean
  note?: string
}

export interface AppNotification {
  id: string
  date: string
  tod: Tod
  /** The reminder time it was for, "HH:MM". */
  time?: string
  createdAt: number
  read: boolean
  items: { routineName: string; productNames: string[] }[]
}

export interface Settings {
  id: 'me'
  name: string
  /** 24h "HH:MM" */
  morningTime: string
  eveningTime: string
  remindersOn: boolean
  pushOn: boolean
  onboarded: boolean
  /** When first-time setup finished. Reminders from before then aren't created. */
  onboardedAt?: number
  timezone: string
}
