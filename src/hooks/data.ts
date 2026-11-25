import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, getSettings } from '../db/db'
import { loadPlanData } from '../domain/actions'
import { todayKey } from '../domain/dates'

export const useSettings = () => useLiveQuery(() => getSettings(), [])
export const useProducts = () => useLiveQuery(() => db.products.orderBy('createdAt').toArray(), [])
export const useRoutines = () => useLiveQuery(() => db.routines.orderBy('createdAt').toArray(), [])
export const usePlan = (dates: string[]) => useLiveQuery(() => loadPlanData(dates), [dates.join(',')])

/** Today's date, which moves on at midnight and when the app comes back to the front. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const check = () => setToday(todayKey())
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}
