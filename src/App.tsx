import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { TabBar } from './components/TabBar'
import { ToastProvider } from './components/Toast'
import { generateDueNotifications } from './domain/actions'
import { currentReminderPlan } from './domain/reminders'
import type { Settings } from './domain/types'
import { useSettings, useToday } from './hooks/data'
import { stopServerReminders, syncServerReminders } from './lib/push'
import { History } from './screens/History'
import { Notifications } from './screens/Notifications'
import { Plan } from './screens/onboarding/Plan'
import { RemindersAsk } from './screens/onboarding/RemindersAsk'
import { Welcome } from './screens/onboarding/Welcome'
import { ProductForm } from './screens/ProductForm'
import { RoutineBuilder } from './screens/RoutineBuilder'
import { Routines } from './screens/Routines'
import { SettingsScreen } from './screens/Settings'
import { Shelf } from './screens/Shelf'
import { DayView, Today } from './screens/Today'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Checks for due reminders when the app opens, every minute while it's open, and when it comes back to the front. */
function useReminderTicker(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const run = () => { void generateDueNotifications() }
    run()
    const timer = window.setInterval(run, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}

/**
 * Keeps the reminder server up to date with this phone's plan, so reminders arrive while the app is closed.
 * Runs when routines, times or today's logs change, and when the app comes back to the front.
 */
function usePushSync(settings?: Settings) {
  const today = useToday()
  const plan = useLiveQuery(() => currentReminderPlan(), [today])
  const want = !!settings?.remindersOn && !!settings.pushOn
  const planKey = plan ? JSON.stringify(plan) : ''
  useEffect(() => {
    if (!settings || !planKey) return
    const sync = () => { void (want ? syncServerReminders() : stopServerReminders()) }
    const timer = window.setTimeout(sync, 300)
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [want, planKey, !!settings])
}

function Tabs({ onboarded }: { onboarded: boolean }) {
  if (!onboarded) return <Navigate to="/welcome" replace />
  return (
    <>
      <main className="page with-tabs"><Outlet /></main>
      <TabBar />
    </>
  )
}

export default function App() {
  const settings = useSettings()
  useReminderTicker(!!settings?.onboarded && !!settings?.remindersOn)
  usePushSync(settings)
  if (!settings) return <div className="page loading" />
  return (
    <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/reminders" element={<RemindersAsk />} />
        <Route path="/routine/new" element={<RoutineBuilder />} />
        <Route path="/routine/:id" element={<RoutineBuilder />} />
        <Route path="/product/new" element={<ProductForm />} />
        <Route path="/product/:id" element={<ProductForm />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route element={<Tabs onboarded={settings.onboarded} />}>
          <Route index element={<Today />} />
          <Route path="day/:date" element={<DayView />} />
          <Route path="shelf" element={<Shelf />} />
          <Route path="routines" element={<Routines />} />
          <Route path="history" element={<History />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
