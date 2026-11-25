import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { db } from '../db/db'
import { setLogNote } from '../domain/actions'
import { addDays, dateKey, dayLabel, fmtTime, longDate, MONTHS, parseKey } from '../domain/dates'
import { entriesForDate, lastDone, type Entry } from '../domain/schedule'
import { usePlan, useProducts, useToday } from '../hooks/data'

export function History() {
  const today = useToday()
  const [month, setMonth] = useState(() => { const d = parseKey(today); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = useState(() => addDays(today, -1))
  const start = dateKey(new Date(month.y, month.m, 1))
  const end = dateKey(new Date(month.y, month.m + 1, 0))
  const monthLogs = useLiveQuery(() => db.logs.where('date').between(start, end, true, true).toArray(), [start, end])
  const recent = useLiveQuery(() => db.logs.orderBy('at').reverse().limit(300).toArray(), [])
  if (!monthLogs || !recent) return null

  const t = parseKey(today)
  const isCurrentMonth = month.y === t.getFullYear() && month.m === t.getMonth()
  const days = new Date(month.y, month.m + 1, 0).getDate()
  const lead = (new Date(month.y, month.m, 1).getDay() + 6) % 7
  const shift = (by: number) => setMonth(({ y, m }) => { const d = new Date(y, m + by, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  return (
    <div className="view">
      <header className="pagehead"><span className="label">What you actually used</span><h1>History</h1></header>

      <div className="lasttime">
        {(['am', 'pm'] as const).map(tod => {
          const l = lastDone(recent, x => x.tod === tod)
          return (
            <div key={tod} className={`lt face-${tod}`}>
              <span className="label"><Icon name={tod === 'am' ? 'sun' : 'moon'} />Last {tod === 'am' ? 'morning' : 'evening'}</span>
              {l ? <><span className="lt-name">{l.routineName}</span><span className="lt-when">{dayLabel(l.date, today)} at {fmtTime(l.at)}</span></>
                : <span className="lt-when">Nothing logged yet</span>}
            </div>
          )
        })}
      </div>

      <div className="cal">
        <div className="cal-head">
          <h2>{MONTHS[month.m]} {month.y}</h2>
          <div className="cal-nav">
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="left" /></button>
            <button type="button" aria-label="Next month" disabled={isCurrentMonth} onClick={() => shift(1)}><Icon name="right" /></button>
          </div>
        </div>
        <div className="cal-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dow" aria-hidden="true">{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`lead${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const key = dateKey(new Date(month.y, month.m, i + 1))
            if (key > today) return <span key={key} className="day future">{i + 1}</span>
            const logs = monthLogs.filter(l => l.date === key).sort((a, b) => a.at - b.at)
            return (
              <button key={key} type="button" className={key === today ? 'day today' : 'day'} aria-pressed={key === selected} aria-label={`${dayLabel(key, today)}, ${longDate(key)}`} onClick={() => setSelected(key)}>
                {i + 1}
                <span className="marks">
                  {logs.slice(0, 3).map(l => (
                    <span key={l.id} className={l.status === 'skipped' ? 'm sk' : 'm'}><Icon name={l.status === 'skipped' ? 'dash' : l.tod === 'am' ? 'sun' : 'moon'} /></span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <DayLog date={selected} today={today} />
    </div>
  )
}

const STATUS: Record<Entry['status'], [string, string]> = { done: ['Done', 'chip-done'], skipped: ['Skipped', 'chip-skip'], planned: ['Not done', ''] }

/** Everything for one day: what was done or skipped, with the products as they were at the time. */
export function DayLog({ date, today }: { date: string; today: string }) {
  const plan = usePlan([date])
  const products = useProducts()
  if (!plan || !products) return null
  const byId = new Map(products.map(p => [p.id, p]))
  const entries = entriesForDate(date, plan).filter(e => e.status !== 'planned' || date <= today)
  return (
    <div className="daylog">
      <h3>{dayLabel(date, today)}<span className="sub">{longDate(date)}</span></h3>
      {entries.length === 0 && <p className="hint">Nothing was planned or logged this day.</p>}
      {entries.map(e => <LogCard key={e.key} entry={e} isToday={date === today} names={e.log ? e.log.productNames : (e.routine?.productIds ?? []).map(id => byId.get(id)?.name ?? '').filter(Boolean)} />)}
    </div>
  )
}

function LogCard({ entry: e, names, isToday }: { entry: Entry; names: string[]; isToday: boolean }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(e.log?.note ?? '')
  const [label, cls] = STATUS[e.status]
  const part = e.tod === 'am' ? 'Morning' : 'Evening'
  return (
    <article className={`log face-${e.tod}`}>
      <div className="log-top">
        <Icon name={e.tod === 'am' ? 'sun' : 'moon'} />
        {e.log ? `${part} at ${fmtTime(e.log.at)}` : part}
        <span className={`chip ${cls}`}>{e.status === 'planned' && isToday ? 'Not done yet' : label}</span>
      </div>
      <p className="log-name">{e.name}</p>
      <p className="log-prods"><em>{e.status === 'done' ? 'Used:' : 'Planned:'}</em> {names.length ? names.join(' → ') : 'No products'}</p>
      {e.log && !editing && e.log.note && <p className="log-note">“{e.log.note}”</p>}
      {e.log && !editing && (
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setEditing(true)}>{e.log.note ? 'Edit note' : 'Add a note'}</button>
      )}
      {e.log && editing && (
        <div className="field">
          <textarea aria-label="Note" value={note} onChange={ev => setNote(ev.target.value)} placeholder="Anything you want to remember about this day" />
          <div className="form-actions">
            <button type="button" className="btn btn-quiet" onClick={() => { setNote(e.log?.note ?? ''); setEditing(false) }}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={async () => { await setLogNote(e.log!.id, note); setEditing(false) }}>Save note</button>
          </div>
        </div>
      )}
    </article>
  )
}
