import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Art, type ArtColor, type ArtShape } from '../../components/Art'
import { Icon } from '../../components/Icon'
import { MONTHS, WEEKDAYS } from '../../domain/dates'
import { isInstalled, isIOS } from '../../lib/notify'

const SAMPLE: { name: string; shape: ArtShape; color: ArtColor }[] = [
  { name: 'Face wash', shape: 'pump', color: 'sky' },
  { name: 'Arcwell', shape: 'dropper', color: 'butter' },
  { name: 'Hydrator', shape: 'bottle', color: 'peach' },
  { name: 'Merytino', shape: 'jar', color: 'blush' },
  { name: 'Sunscreen', shape: 'tube', color: 'butter' },
]
export const STACK_TILTS = [-7, 5, -3, 8, -5]

export function Welcome() {
  const navigate = useNavigate()
  const now = new Date()
  const date = `${WEEKDAYS[now.getDay()].slice(0, 3)} ${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)}`
  return (
    <main className="page">
      <section className="onboard" aria-labelledby="welcome-title">
        <div className="ob-inner">
          <h1 className="ob-title" id="welcome-title">No more guessing which products you used <em>yesterday</em>.</h1>
          <div className="ob-card" role="img" aria-label="An example morning routine with each product pictured in order">
            <div className="ob-top"><Icon name="sun" /><span>This morning</span><span className="t">{date}</span></div>
            <div className="ob-panel">
              <span className="rn">Arcwell morning</span>
              <ol className="ob-stack">
                {SAMPLE.map((p, i) => (
                  <li key={p.name} style={{ '--i': i } as CSSProperties}>
                    <span className="n">{i + 1}</span>
                    <span className="ob-thumb" style={{ '--r': `${STACK_TILTS[i]}deg` } as CSSProperties}>
                      <Art shape={p.shape} color={p.color} style={{ height: 44 }} />
                    </span>
                    <span>{p.name}</span>
                  </li>
                ))}
              </ol>
              <p className="ob-yday"><Icon name="check" /><span>Yesterday you used Nimbosin morning.</span></p>
            </div>
          </div>
          <p className="ob-why">Add your morning and night routines once. Each day, we’ll show you what’s next and remind you when it’s time.</p>
          {isIOS() && !isInstalled() && (
            <p className="notice">Using an iPhone? Add us to your Home Screen first: tap the Share button, then “Add to Home Screen”, and open us from there. That way your routines and reminders stay together.</p>
          )}
          <div className="ob-actions">
            <button className="btn btn-primary" type="button" onClick={() => navigate('/plan')}>Add my products</button>
          </div>
        </div>
      </section>
    </main>
  )
}
