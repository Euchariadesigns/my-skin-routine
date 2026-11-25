export type PhoneReminderSupport = 'ok' | 'install' | 'blocked' | 'none'

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Whether this phone can show our reminders as phone notifications right now.
 * iPhones only allow it once the app is added to the Home Screen.
 */
export function phoneReminderSupport(): PhoneReminderSupport {
  const ios = isIOS(), installed = isInstalled()
  if (!('Notification' in window)) return ios && !installed ? 'install' : 'none'
  if (Notification.permission === 'denied') return 'blocked'
  if (ios && !installed) return 'install'
  return 'ok'
}

export async function askForPhoneReminders(): Promise<boolean> {
  if (phoneReminderSupport() !== 'ok') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Shows a reminder as a phone notification, if the person turned them on. Tapping it opens `url`. */
export async function showPhoneNotification(title: string, body: string, url: string, tag: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, data: { url }, icon: '/icons/icon-192.png' })
      return
    }
    new Notification(title, { body, tag })
  } catch {
    /* the in-app reminder is still there */
  }
}

export const SUPPORT_MESSAGE: Record<Exclude<PhoneReminderSupport, 'ok'>, string> = {
  install: 'On iPhone, phone reminders work once we’re on your Home Screen. Tap the Share button, then “Add to Home Screen”. Open us from there and turn on phone reminders in Alerts.',
  blocked: 'Notifications are turned off for us in your phone’s settings. You can turn them back on there. We’ll still remind you inside the app.',
  none: 'This browser can’t show phone reminders. We’ll still remind you inside the app.',
}
