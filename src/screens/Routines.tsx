import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { db } from '../db/db'
import { setScheduleActive } from '../domain/actions'
import { describeDays } from '../domain/dates'
import { describeSchedule, scheduleOf } from '../domain/describe'
import { distinctProducts, rotationRoutineId } from '../domain/schedule'
import type { Routine, Tod } from '../domain/types'
import { useProducts, useRoutines } from '../hooks/data'

const TAPE: Record<string, string> = { exfoliation: 'peach', recovery: 'sage', retinoid: 'lilac', slugging: 'sky' }

export function Routines() {
  const routines = useRoutines()
  const products = useProducts()
  const sched = useLiveQuery(async () => ({ schedules: await db.schedules.toArray(), rotations: await db.rotations.toArray() }), [])
  if (!routines || !products || !sched) return null
  const byId = new Map(products.map(p => [p.id, p]))
  const nameOf = (id: string) => routines.find(r => r.id === id)?.name ?? 'Removed routine'

  const card = (r: Routine) => {
    const rs = scheduleOf(r.id, sched.schedules, sched.rotations)
    const highlight = distinctProducts(r, routines)
    const weekly = rs && !rs.rotation ? rs : undefined
    return (
      <article key={r.id} className={`rcard face-${r.tod}${rs && !rs.active ? ' paused' : ''}`}>
        {r.tags.slice(0, 2).map((t, i) => (
          <span key={t} className={`tape t-${TAPE[t] ?? 'butter'}`} style={{ '--rot': `${i ? 4 : -5}deg`, '--top': `${-11 + i * 24}px` } as CSSProperties}>{t}</span>
        ))}
        <span className="label">{r.tod === 'am' ? 'Morning' : 'Evening'}</span>
        <h3>{r.name}</h3>
        <p className="rprods">
          {r.productIds.length
            ? r.productIds.map((id, i) => (
                <span key={id}>{i > 0 && ' → '}{highlight.includes(id) ? <b className="kp">{byId.get(id)?.name}</b> : byId.get(id)?.name}</span>
              ))
            : 'No products, just a label'}
        </p>
        <p className="rmeta"><span><Icon name={r.tod === 'am' ? 'sun' : 'moon'} />{describeSchedule(rs, routines)}</span></p>
        <div className="rcard-actions">
          <Link className="btn btn-ghost" to={`/routine/${r.id}`}>Edit</Link>
          {weekly?.scheduleId && (
            <button type="button" className="btn btn-quiet" onClick={() => setScheduleActive(weekly.scheduleId!, !weekly.active)}>
              {weekly.active ? 'Pause' : 'Resume'}
            </button>
          )}
        </div>
      </article>
    )
  }

  const group = (tod: Tod) => routines.filter(r => r.tod === tod)

  return (
    <div className="view">
      <header className="pagehead">
        <span className="label">What you planned</span>
        <h1>Routines</h1>
        <p>Each routine is the products you use, in your order. You give it a name. Pausing keeps the routine and its history.</p>
      </header>

      {sched.rotations.map(rot => {
        const s = sched.schedules.find(x => x.rotationId === rot.id)
        const current = rotationRoutineId(rot)
        return (
          <div key={rot.id} className={`card rot${s && !s.active ? ' paused' : ''}`}>
            <span className="label">{rot.tod === 'am' ? 'Mornings' : 'Evenings'} that take turns{s ? `, ${describeDays(s.weekdays).toLowerCase()}` : ''}</span>
            <h3>{rot.tod === 'am' ? 'One morning each' : 'One evening each'}</h3>
            <div className="seq">
              {rot.routineIds.map((id, i) => (
                <span key={id} style={{ display: 'contents' }}>
                  {i > 0 && <span className="arrow">then</span>}
                  <span className={`pill${rot.tod === 'pm' ? ' pm' : ''}${id === current ? ' cur' : ''}`}>{nameOf(id)}</span>
                </span>
              ))}
              <span className="arrow">then back again</span>
            </div>
            <p className="rmeta">{s && !s.active ? 'Paused for now.' : `${current ? nameOf(current) : 'The first one'} is next.`}</p>
            {s && (
              <div className="rcard-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setScheduleActive(s.id, !s.active)}>{s.active ? 'Pause' : 'Resume'}</button>
              </div>
            )}
          </div>
        )
      })}

      {routines.length === 0 && <div className="empty"><p>No routines yet. Add the products you use in the morning or at night, and give the routine a name.</p></div>}
      {(['am', 'pm'] as Tod[]).map(tod => group(tod).length > 0 && (
        <div key={tod} className="rlist">{group(tod).map(card)}</div>
      ))}

      <Link className="btn btn-ghost" to="/routine/new"><Icon name="plus" />New routine</Link>
    </div>
  )
}
