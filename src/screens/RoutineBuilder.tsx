import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { ProductPic } from '../components/ProductPic'
import { useToast } from '../components/Toast'
import { db } from '../db/db'
import { addProduct, deleteRoutine, saveRoutine, type ScheduleChoice } from '../domain/actions'
import { ALL_DAYS, joinAnd, WEEK_ORDER, WEEKDAYS } from '../domain/dates'
import { scheduleOf } from '../domain/describe'
import type { Product, Rotation, Routine, Schedule, Tod } from '../domain/types'
import { useProducts, useRoutines } from '../hooks/data'
import { processPhoto } from '../lib/photo'

const BUILT_IN_TAGS = ['exfoliation', 'recovery', 'retinoid', 'slugging']
const EXAMPLE_NAME: Record<Tod, string> = { am: 'Acwell morning', pm: 'Exfoliating evening' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function RoutineBuilder() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const products = useProducts()
  const routines = useRoutines()
  const sched = useLiveQuery(async () => ({ schedules: await db.schedules.toArray(), rotations: await db.rotations.toArray() }), [])
  if (!products || !routines || !sched) return <main className="page loading" />
  const editing = id ? routines.find(r => r.id === id) : undefined
  if (id && !editing) {
    return (
      <main className="page"><div className="form">
        <h1>That routine isn’t here anymore</h1>
        <Link className="btn btn-ghost" to="/routines">Back to routines</Link>
      </div></main>
    )
  }
  return (
    <BuilderForm
      key={id ?? 'new'}
      from={params.get('from') === 'plan' ? 'plan' : 'app'}
      initialTod={params.get('tod') === 'pm' ? 'pm' : 'am'}
      editing={editing}
      products={products}
      routines={routines}
      schedules={sched.schedules}
      rotations={sched.rotations}
    />
  )
}

interface FormProps {
  from: 'plan' | 'app'
  initialTod: Tod
  editing?: Routine
  products: Product[]
  routines: Routine[]
  schedules: Schedule[]
  rotations: Rotation[]
}

type Kind = ScheduleChoice['kind']

function BuilderForm({ from, initialTod, editing, products, routines, schedules, rotations }: FormProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const plan = from === 'plan'
  const initial = editing ? scheduleOf(editing.id, schedules, rotations) : undefined

  const [tod, setTod] = useState<Tod>(editing?.tod ?? initialTod)
  const others = routines.filter(r => r.tod === tod && r.id !== editing?.id)
  const [order, setOrder] = useState<string[]>(editing?.productIds ?? [])
  const [name, setName] = useState(editing?.name ?? '')
  const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
  const [ownTag, setOwnTag] = useState('')
  const [kind, setKind] = useState<Kind>(initial?.choice.kind ?? (plan && others.length ? 'turns' : 'everyday'))
  const [days, setDays] = useState<number[]>(initial && initial.choice.kind !== 'everyday' ? initial.choice.weekdays : ALL_DAYS)
  const [withIds, setWithIds] = useState<string[]>(initial?.choice.kind === 'turns' ? initial.choice.withIds : plan ? others.map(r => r.id) : [])
  const [npName, setNpName] = useState('')
  const [npPhoto, setNpPhoto] = useState<{ blob: Blob; cutout: boolean; url: string }>()
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => () => { if (npPhoto) URL.revokeObjectURL(npPhoto.url) }, [npPhoto])

  const word = tod === 'am' ? 'morning' : plan ? 'night' : 'evening'
  const byId = new Map(products.map(p => [p.id, p]))
  const shelfChoices = products.filter(p => !order.includes(p.id))
  const showSchedule = !plan || others.length > 0
  const customTags = tags.filter(t => !BUILT_IN_TAGS.includes(t))

  const changeTod = (t: Tod) => {
    setTod(t)
    setWithIds([])
    if (kind === 'turns') setKind('everyday')
  }

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { blob, cutout } = await processPhoto(file)
      setNpPhoto({ blob, cutout, url: URL.createObjectURL(blob) })
      document.getElementById('np-name')?.focus()
    } catch {
      toast('That photo couldn’t be opened. Try another one.')
    }
  }

  const addNew = async (): Promise<string | undefined> => {
    const n = npName.trim()
    if (!n) {
      toast('Type the name on the bottle first.')
      document.getElementById('np-name')?.focus()
      return undefined
    }
    const pid = await addProduct({ name: n, photo: npPhoto?.blob, cutout: npPhoto?.cutout })
    setOrder(o => [...o, pid])
    setNpName('')
    setNpPhoto(undefined)
    return pid
  }

  const move = (pid: string, by: number) => setOrder(o => {
    const i = o.indexOf(pid), j = i + by
    if (j < 0 || j >= o.length) return o
    const next = [...o]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setErr(undefined)
    let productIds = order
    if (npName.trim()) {
      const pid = await addNew()
      if (pid) productIds = [...order, pid]
    }
    const n = name.trim()
    if (!n) return setErr(`Give this ${word} routine a name to save it.`)
    let choice: ScheduleChoice = { kind: 'everyday' }
    if (showSchedule) {
      if (kind === 'days') {
        if (!days.length) return setErr('Pick at least one day.')
        choice = { kind: 'days', weekdays: days }
      } else if (kind === 'turns') {
        const ids = others.length === 1 ? [others[0].id] : withIds
        if (!ids.length) return setErr('Pick a routine to take turns with.')
        choice = { kind: 'turns', withIds: ids, weekdays: plan ? ALL_DAYS : days.length ? days : ALL_DAYS }
      }
    }
    const allTags = [...new Set([...tags, ...(ownTag.trim() ? [ownTag.trim()] : [])])]
    setBusy(true)
    await saveRoutine({ id: editing?.id, name: n, tod, productIds, tags: allTags }, choice)
    toast(`${n} is saved.`)
    navigate(plan ? '/plan' : '/routines', { replace: true })
  }

  const remove = async () => {
    if (!editing) return
    await deleteRoutine(editing.id)
    toast(`${editing.name} is deleted. Your history stays.`)
    navigate('/routines', { replace: true })
  }

  const cancel = () => {
    if (plan) navigate('/plan')
    else if (editing) navigate('/routines')
    else navigate(-1)
  }
  const title = editing ? 'Edit routine' : plan ? (others.length ? `Another ${word} routine` : `Your ${word} routine`) : 'New routine'
  const otherNames = joinAnd(others.map(r => r.name))

  return (
    <main className="page">
      <form className="form" onSubmit={save} noValidate aria-labelledby="builder-title">
        <div className="form-top">
          <h1 id="builder-title">{title}</h1>
          <button type="button" className="iconbtn" onClick={cancel} aria-label="Close"><Icon name="close" /></button>
        </div>

        {!plan && (
          <fieldset className="field">
            <legend>Is this for the morning or the evening?</legend>
            <div className="chips">
              {(['am', 'pm'] as Tod[]).map(t => (
                <label key={t}><input type="radio" name="tod" checked={tod === t} onChange={() => changeTod(t)} /><span>{t === 'am' ? 'Morning' : 'Evening'}</span></label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="field">
          <span>What do you use in this routine?</span>
          <p className="hint">Add each product in the order you use it. Take a photo and type its name as it’s written on the bottle.</p>
          <ol className="order">
            {order.length === 0 && <li className="empty-row">Nothing added yet.</li>}
            {order.map((pid, i) => {
              const p = byId.get(pid)
              const nm = p?.name ?? 'Removed product'
              return (
                <li key={pid}>
                  <span className="n">{i + 1}</span>
                  <ProductPic product={p} size={36} />
                  <span className="nm">{nm}</span>
                  <span className="mv">
                    <button type="button" aria-label={`Move ${nm} up`} onClick={() => move(pid, -1)}>↑</button>
                    <button type="button" aria-label={`Move ${nm} down`} onClick={() => move(pid, 1)}>↓</button>
                    <button type="button" aria-label={`Remove ${nm}`} onClick={() => setOrder(o => o.filter(x => x !== pid))}>×</button>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {shelfChoices.length > 0 && (
          <div className="field">
            <span>Already on your shelf <em>Tap one to add it</em></span>
            <div className="chips">
              {shelfChoices.map(p => (
                <button key={p.id} type="button" className="addchip" onClick={() => setOrder(o => [...o, p.id])}>{p.name}</button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span>Add a new product</span>
          <div className="newprod">
            <label className="np-photo" htmlFor="np-camera" aria-label="Take a photo">
              {npPhoto ? <img src={npPhoto.url} alt="" /> : <Icon name="camera" />}
            </label>
            <input type="file" id="np-camera" accept="image/*" capture="environment" className="sr" onChange={onPhoto} />
            <input
              type="text" id="np-name" autoComplete="off" placeholder="Name on the bottle" aria-label="Product name"
              value={npName} onChange={e => setNpName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addNew() } }}
            />
            <button type="button" className="btn btn-ghost" onClick={() => void addNew()}>Add</button>
          </div>
          <label className="linkbtn np-lib" htmlFor="np-library">Or choose a photo you already have</label>
          <input type="file" id="np-library" accept="image/*" className="sr" onChange={onPhoto} />
        </div>

        <label className="field">
          <span>What do you want to call this {word} routine?</span>
          <input type="text" autoComplete="off" placeholder={`For example, ${EXAMPLE_NAME[tod]}`} value={name} onChange={e => { setName(e.target.value); setErr(undefined) }} />
        </label>

        {showSchedule && (
          <fieldset className="field">
            <legend>{plan ? `You already have ${otherNames}. How should this one fit in?` : 'When do you use it?'}</legend>
            <div className="chips">
              {others.length > 0 && (
                <label><input type="radio" name="kind" checked={kind === 'turns'} onChange={() => setKind('turns')} />
                  <span>{others.length === 1 ? `Take turns with ${others[0].name}` : `Take turns with other ${word} routines`}</span></label>
              )}
              <label><input type="radio" name="kind" checked={kind === 'everyday'} onChange={() => setKind('everyday')} /><span>Every day</span></label>
              <label><input type="radio" name="kind" checked={kind === 'days'} onChange={() => setKind('days')} /><span>Only on certain days</span></label>
            </div>
            {kind === 'turns' && others.length > 1 && (
              <>
                <p className="hint">Which ones does it take turns with?</p>
                <div className="chips">
                  {others.map(r => (
                    <label key={r.id}><input type="checkbox" checked={withIds.includes(r.id)} onChange={() => setWithIds(w => toggle(w, r.id))} /><span>{r.name}</span></label>
                  ))}
                </div>
              </>
            )}
            {kind === 'turns' && <p className="hint">One {word} it’s this one, the next {word} it’s the other, and so on.</p>}
            {(kind === 'days' || (kind === 'turns' && !plan)) && (
              <>
                <p className="hint">{kind === 'days' ? 'Which days?' : 'On which days do they take turns?'}</p>
                <div className="chips">
                  {WEEK_ORDER.map(d => (
                    <label key={d}><input type="checkbox" checked={days.includes(d)} onChange={() => setDays(x => toggle(x, d))} /><span>{WEEKDAYS[d].slice(0, 3)}</span></label>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        )}

        {!plan && (
          <fieldset className="field">
            <legend>Tags <em>(optional)</em></legend>
            <div className="chips">
              {[...BUILT_IN_TAGS, ...customTags].map(t => (
                <label key={t}><input type="checkbox" checked={tags.includes(t)} onChange={() => setTags(x => toggle(x, t))} /><span>{cap(t)}</span></label>
              ))}
            </div>
            <input type="text" autoComplete="off" placeholder="Or type your own tag" value={ownTag} onChange={e => setOwnTag(e.target.value)} />
          </fieldset>
        )}

        {err && <p className="err" role="alert">{err}</p>}
        <div className="form-actions pinned">
          <button type="submit" className="btn btn-primary" disabled={busy}>Save routine</button>
        </div>

        {editing && (
          <div className="card">
            {confirmDelete ? (
              <>
                <p>Delete {editing.name}? Your history stays.</p>
                <div className="row2">
                  <button type="button" className="btn btn-danger" onClick={remove}>Delete it</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete this routine</button>
            )}
          </div>
        )}
      </form>
    </main>
  )
}
