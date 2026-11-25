import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { ProductPic } from '../../components/ProductPic'
import { useToast } from '../../components/Toast'
import { updateSettings } from '../../db/db'
import { fmtClock } from '../../domain/dates'
import { useProducts, useRoutines, useSettings } from '../../hooks/data'
import { phoneReminderSupport, SUPPORT_MESSAGE } from '../../lib/notify'
import { turnOnPhoneReminders } from '../../lib/push'
import { askForPersistentStorage } from '../../lib/storage'
import { STACK_TILTS } from './Welcome'

export function RemindersAsk() {
  const navigate = useNavigate()
  const toast = useToast()
  const routines = useRoutines()
  const products = useProducts()
  const settings = useSettings()
  const [notice, setNotice] = useState<string>()
  if (!routines || !products || !settings) return <main className="page loading" />

  const routine = routines[0]
  const am = routine?.tod !== 'pm'
  const byId = new Map(products.map(p => [p.id, p]))
  const times = `${fmtClock(settings.morningTime)} and ${fmtClock(settings.eveningTime)}`

  const finish = async (pushOn: boolean) => {
    await updateSettings({ onboarded: true, onboardedAt: Date.now(), pushOn })
    await askForPersistentStorage()
    navigate('/', { replace: true })
  }

  const yes = async () => {
    const support = phoneReminderSupport()
    if (support !== 'ok') return setNotice(SUPPORT_MESSAGE[support])
    const granted = await turnOnPhoneReminders()
    toast(granted ? `Reminders are on. We’ll remind you at ${times}.` : 'Phone reminders are off. We’ll still remind you inside the app.')
    await finish(granted)
  }

  return (
    <main className="page">
      <section className="onboard cta-bottom" aria-labelledby="remind-title">
        <div className="ob-inner">
          <h1 className="ob-title" id="remind-title">Want a <em>reminder</em> when it’s time?</h1>
          {routine && (
            <div className="ob-card" role="img" aria-label={`A sample reminder for ${routine.name}`}>
              <div className="ob-top">
                <Icon name={am ? 'sun' : 'moon'} />
                <span>{am ? 'This morning' : 'Tonight'}</span>
                <span className="t">{fmtClock(am ? settings.morningTime : settings.eveningTime)}</span>
              </div>
              <div className="ob-panel">
                <span className="rn">{routine.name}</span>
                <ol className="ob-stack">
                  {routine.productIds.map((id, i) => (
                    <li key={id} style={{ '--i': i } as CSSProperties}>
                      <span className="n">{i + 1}</span>
                      <span className="ob-thumb" style={{ '--r': `${STACK_TILTS[i % STACK_TILTS.length]}deg` } as CSSProperties}>
                        <ProductPic product={byId.get(id)} size={32} />
                      </span>
                      <span>{byId.get(id)?.name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {notice ? (
            <>
              <p className="notice">{notice}</p>
              <div className="ob-actions">
                <button className="btn btn-primary" type="button" onClick={() => finish(false)}>Continue</button>
              </div>
            </>
          ) : (
            <>
              <div className="ob-actions">
                <button className="btn btn-primary" type="button" onClick={yes}>Send me reminders</button>
                <button className="btn btn-quiet" type="button" onClick={() => { toast('No problem. We’ll still remind you inside the app.'); void finish(false) }}>Not now</button>
              </div>
              <p className="ob-times">We’ll remind you at {times}. You can change the times anytime.</p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
