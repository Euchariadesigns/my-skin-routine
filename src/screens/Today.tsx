import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { PeelStage, setImprintTime, type PeelHandle } from '../components/PeelStage'
import { ProductPic } from '../components/ProductPic'
import { db } from '../db/db'
import { logEntry, undoLog } from '../domain/actions'
import { addDays, dayLabel, fmtClock, fmtTime, MONTHS, parseKey, partOfDay, WEEKDAYS } from '../domain/dates'
import { distinctProducts, entriesForDate, lastDone, rotationRoutineId, splitByTod, upNext, type Entry } from '../domain/schedule'
import type { Product, Rotation, Routine, RoutineLog, Settings, Tod } from '../domain/types'
import { usePlan, useProducts, useSettings, useToday } from '../hooks/data'
import { tease } from '../lib/peel'
import { DayLog } from './History'

const TAPE: Record<string, string> = { exfoliation: 'peach', recovery: 'sage', retinoid: 'lilac', slugging: 'sky' }
const PIC_TILTS = [-6, 5, -3, 7, -4, 4]
const PEELED_KEY = 'msr-peeled-once'

function hasPeeledBefore(): boolean {
  try { return localStorage.getItem(PEELED_KEY) === '1' } catch { return true }
}
function rememberPeeled(): void {
  try { localStorage.setItem(PEELED_KEY, '1') } catch { /* fine */ }
}

export function Today() {
  const today = useToday()
  return <TodayScreen date={today} />
}

export function DayView() {
  const { date } = useParams()
  const today = useToday()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date === today) return <Navigate to="/" replace />
  return (
    <div className="view">
      <header className="pagehead">
        <Link className="linkbtn" to="/" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Back to today</Link>
      </header>
      <DayLog date={date} today={today} />
    </div>
  )
}

function TodayScreen({ date }: { date: string }) {
  const tomorrow = addDays(date, 1)
  const plan = usePlan([date, tomorrow])
  const products = useProducts()
  const settings = useSettings()
  const recent = useLiveQuery(() => db.logs.orderBy('at').reverse().limit(300).toArray(), [])
  if (!plan || !products || !settings || !recent) return <div className="loading" />

  const entries = entriesForDate(date, plan)
  const { am, pm } = splitByTod(entries)
  const { upNextKey, showTomorrow } = upNext(am, pm)
  const tomorrowAm = showTomorrow ? splitByTod(entriesForDate(tomorrow, plan)).am : []
  const ctx: CardContext = { products: new Map(products.map(p => [p.id, p])), routines: plan.routines, rotations: plan.rotations }
  const d = parseKey(date)
  const greetingName = settings.name.trim()
  const firstPlannedKey = entries.find(e => e.status === 'planned')?.key

  return (
    <div className="view">
      <header className="hello">
        <div className="hello-top">
          <p className="greet">{greetingName ? `Hi ${greetingName},` : 'Hi there,'}<br />here’s your skincare routine for {partOfDay()}.</p>
          <Link className="iconbtn" to="/settings" aria-label="Settings"><Icon name="sliders" /></Link>
        </div>
        <div className="datebig">
          <span className="num">{d.getDate()}</span>
          <div className="dcol"><span className="wk">{WEEKDAYS[d.getDay()]}</span><span className="mo">{MONTHS[d.getMonth()]} {d.getFullYear()}</span></div>
        </div>
      </header>

      {plan.routines.length === 0 ? (
        <div className="empty">
          <p>You haven’t added any routines yet. Add your morning and night routines and we’ll show them here each day.</p>
          <Link className="btn btn-primary" to="/routine/new">Add a routine</Link>
        </div>
      ) : (
        <>
          <Section tod="am" title="Morning" icon="sun" settings={settings} entries={am} date={date} upNextKey={upNextKey} firstPlannedKey={firstPlannedKey} ctx={ctx} recent={recent} />
          <Section tod="pm" title="Evening" icon="moon" settings={settings} entries={pm} date={date} upNextKey={upNextKey} firstPlannedKey={firstPlannedKey} ctx={ctx} recent={recent} />
          {showTomorrow && tomorrowAm.length > 0 && (
            <section className="sect rise" aria-labelledby="h-next">
              <div className="sect-head"><Icon name="rise" /><h2 id="h-next">Tomorrow morning</h2><span className="when">Reminder at {fmtClock(settings.morningTime)}</span></div>
              <div className="slot">
                {tomorrowAm.map((e, i) => e.routine && (
                  <div key={e.key} className="stage" style={{ '--tilt': '-0.8deg' } as CSSProperties}>
                    <div className="under static">
                      <RoutineSticker routine={e.routine} ctx={ctx} eyebrow={i === 0 ? <span className="chip chip-next">Up next</span> : undefined} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {entries.some(e => e.status === 'planned') && <p className="hint-peel">Tip: drag the folded corner to peel a routine off, or tap Mark complete.</p>}
        </>
      )}
    </div>
  )
}

interface CardContext {
  products: Map<string, Product>
  routines: Routine[]
  rotations: Rotation[]
}

function Section(props: {
  tod: Tod; title: string; icon: 'sun' | 'moon'; settings: Settings; entries: Entry[]; date: string
  upNextKey?: string; firstPlannedKey?: string; ctx: CardContext; recent: RoutineLog[]
}) {
  const { tod, title, icon, settings, entries, date, upNextKey, firstPlannedKey, ctx, recent } = props
  const last = entries.some(e => e.status === 'planned') ? lastDone(recent, l => l.tod === tod, date) : undefined
  return (
    <section className="sect" aria-labelledby={`h-${tod}`}>
      <div className="sect-head">
        <Icon name={icon} />
        <h2 id={`h-${tod}`}>{title}</h2>
        <span className="when">Reminder at {fmtClock(tod === 'am' ? settings.morningTime : settings.eveningTime)}</span>
      </div>
      <div className="slot">
        {entries.length === 0 && (
          <div className="empty">
            <p>Nothing scheduled for this time. You can add a routine or enjoy a rest {tod === 'am' ? 'morning' : 'night'}.</p>
            <Link className="linkbtn" to={`/routine/new?tod=${tod}`} style={{ paddingLeft: 0 }}>Add a {tod === 'am' ? 'morning' : 'evening'} routine</Link>
          </div>
        )}
        {entries.map(e => (
          <EntryCard key={e.key} entry={e} ctx={ctx} upNext={e.key === upNextKey} teaseMe={e.key === firstPlannedKey} />
        ))}
        {last && (
          <p className="status"><Icon name="check" /><span>Last time: <b>{last.routineName}</b>, {dayLabel(last.date, date).toLowerCase()} at {fmtTime(last.at)}.</span></p>
        )}
      </div>
    </section>
  )
}

function RoutineSticker({ routine, ctx, eyebrow, actions }: { routine: Routine; ctx: CardContext; eyebrow?: ReactNode; actions?: ReactNode }) {
  const highlight = distinctProducts(routine, ctx.routines)
  return (
    <div className={`sticker face-${routine.tod}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h3 className="rname">{routine.name}</h3>
      {routine.productIds.length ? (
        <ol className="steps">
          {routine.productIds.map((pid, i) => {
            const p = ctx.products.get(pid)
            return (
              <li key={pid} className={highlight.includes(pid) ? 'key' : undefined}>
                <span className="n">{i + 1}</span>
                <span className="pic" style={{ '--r': `${PIC_TILTS[i % PIC_TILTS.length]}deg` } as CSSProperties}><ProductPic product={p} size={36} /></span>
                <span>{p?.name ?? 'Removed product'}</span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="nosteps">No products. This routine is just a label.</p>
      )}
      {routine.tags.length > 0 && <p className="tagline">You tagged this routine as {routine.tags.join(' and ')}.</p>}
      {actions}
    </div>
  )
}

function Tapes({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.slice(0, 2).map((t, i) => (
        <span key={t} className={`tape t-${TAPE[t] ?? 'butter'}`} style={{ '--rot': `${i ? 4 : -5}deg`, '--top': `${-13 + i * 26}px` } as CSSProperties}>{t}</span>
      ))}
    </>
  )
}

function Imprint({ name, line, icon = 'check', onUndo }: { name: string; line: string; icon?: 'check' | 'dash'; onUndo?: () => void }) {
  return (
    <div className="imprint">
      <Icon name={icon} />
      <div className="imprint-body"><p className="imprint-title">{name}</p><p className="imprint-meta">{line}</p></div>
      {onUndo && <button className="linkbtn" type="button" onClick={onUndo}>Undo</button>}
    </div>
  )
}

function EntryCard({ entry, ctx, upNext: isUpNext, teaseMe }: { entry: Entry; ctx: CardContext; upNext: boolean; teaseMe: boolean }) {
  const stage = useRef<PeelHandle>(null)
  const [anim, setAnim] = useState<'restick' | 'flipIn'>()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lifting, setLifting] = useState(false)
  const wasUpNext = useRef(isUpNext)
  const tilt = entry.tod === 'am' ? -1.3 : 1.1
  const rotation = entry.rotationId ? ctx.rotations.find(r => r.id === entry.rotationId) : undefined

  useEffect(() => {
    if (isUpNext && !wasUpNext.current) {
      setLifting(true)
      const t = window.setTimeout(() => setLifting(false), 700)
      wasUpNext.current = isUpNext
      return () => window.clearTimeout(t)
    }
    wasUpNext.current = isUpNext
  }, [isUpNext])

  useEffect(() => {
    if (!anim) return
    const t = window.setTimeout(() => setAnim(undefined), 1000)
    return () => window.clearTimeout(t)
  }, [anim])

  useEffect(() => {
    if (!teaseMe || entry.status !== 'planned' || hasPeeledBefore()) return
    const t = window.setTimeout(() => {
      const el = stage.current?.element()
      if (el) void tease(el)
    }, 900)
    return () => window.clearTimeout(t)
  }, [teaseMe, entry.status])

  const complete = async () => {
    if (busy) return
    setBusy(true)
    setImprintTime(stage.current?.element() ?? null)
    await stage.current?.peel()
    rememberPeeled()
    await logEntry(entry, 'done')
    setBusy(false)
  }
  const peeledByDrag = async () => {
    rememberPeeled()
    await logEntry(entry, 'done')
  }
  const skip = async () => {
    if (busy) return
    await stage.current?.flipOut()
    if (entry.rotationId) {
      setAnim('flipIn')
      setAsking(true)
      return
    }
    setAnim('flipIn')
    await logEntry(entry, 'skipped')
  }
  const decide = async (advance: boolean) => {
    if (busy) return
    setBusy(true)
    const now = fmtTime(Date.now())
    const nextName = advance && rotation ? ctx.routines.find(r => r.id === rotation.routineIds[(rotation.currentStep + 1) % rotation.routineIds.length])?.name : entry.name
    setImprintTime(stage.current?.element() ?? null, advance ? `Skipped at ${now}. ${nextName} is next.` : `Skipped at ${now}. ${entry.name} stays for next time.`)
    await stage.current?.peel()
    await logEntry(entry, 'skipped', { advance })
    setAsking(false)
    setBusy(false)
  }
  const cancelSkip = async () => {
    await stage.current?.flipOut()
    setAnim('flipIn')
    setAsking(false)
  }
  const undo = async (flip: boolean) => {
    if (!entry.log) return
    if (flip) await stage.current?.flipOut()
    setAnim(flip ? 'flipIn' : 'restick')
    await undoLog(entry.log.id)
  }

  const routine = entry.routine
  const wrap = (node: ReactNode) => <div className={lifting ? 'lift' : undefined}>{node}</div>

  if (entry.status === 'planned' && asking && routine) {
    const nextId = rotation ? rotation.routineIds[(rotation.currentStep + 1) % rotation.routineIds.length] : undefined
    const nextName = ctx.routines.find(r => r.id === nextId)?.name ?? 'the next one'
    return wrap(
      <PeelStage ref={stage} tilt={tilt} peelable={false} flipInOnMount under={<Imprint name={entry.name} line="Skipped" icon="dash" />}>
        <div className="sticker sticker-back">
          <p className="eyebrow"><span className="chip chip-skip">Skipped</span></p>
          <p className="backq">Which routine next {entry.tod === 'am' ? 'morning' : 'evening'}?</p>
          <p className="backsub">You skipped {entry.name}. Your routines only move on if you say so.</p>
          <div className="actions col">
            <button className="btn btn-primary" type="button" onClick={() => decide(true)}>Move on to {nextName}</button>
            <button className="btn btn-ghost" type="button" onClick={() => decide(false)}>Do {entry.name} next time</button>
            <button className="linkbtn" type="button" onClick={cancelSkip}>Undo skip</button>
          </div>
        </div>
      </PeelStage>,
    )
  }

  if (entry.status === 'planned' && routine) {
    return wrap(
      <PeelStage
        ref={stage}
        tilt={tilt}
        restickOnMount={anim === 'restick'}
        flipInOnMount={anim === 'flipIn'}
        onPeeled={peeledByDrag}
        under={<Imprint name={entry.name} line="Done" />}
      >
        <RoutineSticker
          routine={routine}
          ctx={ctx}
          eyebrow={isUpNext ? <span className="chip chip-next">Up next</span> : undefined}
          actions={
            <div className="actions">
              <button className="btn btn-primary" type="button" onClick={complete} disabled={busy}>Mark complete</button>
              <button className="btn btn-quiet" type="button" onClick={skip} disabled={busy}>Skip</button>
              <Link className="editlink" to={`/routine/${routine.id}`}>Edit</Link>
            </div>
          }
        />
        <Tapes tags={routine.tags} />
      </PeelStage>,
    )
  }

  const time = entry.log ? fmtTime(entry.log.at) : ''
  if (entry.status === 'done') {
    return (
      <div className="stage" style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
        <div className="under static"><Imprint name={entry.name} line={`Done at ${time}`} onUndo={() => undo(false)} /></div>
      </div>
    )
  }

  if (entry.status === 'skipped' && entry.rotationId) {
    const rot = rotation
    const nextName = entry.log?.advanced && rot ? ctx.routines.find(r => r.id === rotationRoutineId(rot))?.name : undefined
    const line = nextName ? `Skipped at ${time}. ${nextName} is next.` : `Skipped at ${time}. ${entry.name} stays for next time.`
    return (
      <div className="stage" style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
        <div className="under static"><Imprint name={entry.name} line={line} icon="dash" onUndo={() => undo(false)} /></div>
      </div>
    )
  }

  return (
    <PeelStage ref={stage} tilt={tilt} peelable={false} flipInOnMount={anim === 'flipIn'}>
      <div className="sticker sticker-back">
        <p className="eyebrow"><span className="chip chip-skip">Skipped</span></p>
        <p className="backq">{entry.name}</p>
        <p className="backsub">Skipped at {time}. Your plan stays the same.</p>
        <div className="actions"><button className="linkbtn" type="button" onClick={() => undo(true)}>Undo</button></div>
      </div>
    </PeelStage>
  )
}
