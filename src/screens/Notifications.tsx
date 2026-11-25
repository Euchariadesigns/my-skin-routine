import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { db, updateSettings } from '../db/db'
import { dayLabel, fmtClock, fmtTime } from '../domain/dates'
import { useSettings, useToday } from '../hooks/data'
import { askForPhoneReminders, phoneReminderSupport, SUPPORT_MESSAGE } from '../lib/notify'

export function Notifications() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const settings = useSettings()
  const notes = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().toArray(), [])
  const [notice, setNotice] = useState<string>()
  if (!settings || !notes) return null

  const unread = notes.filter(n => !n.read)
  const turnOn = async () => {
    const support = phoneReminderSupport()
    if (support !== 'ok') return setNotice(SUPPORT_MESSAGE[support])
    const granted = await askForPhoneReminders()
    await updateSettings({ pushOn: granted })
    toast(granted ? 'Phone reminders are on.' : 'Phone reminders are still off. We’ll keep reminding you here.')
  }

  return (
    <div className="view">
      <header className="pagehead"><span className="label">Your reminders</span><h1>Notifications</h1></header>

      <div className="card">
        <span className="label">{settings.remindersOn ? 'Reminders are on' : 'Reminders are off'}</span>
        <div className="remrow"><span>Morning</span><span>{fmtClock(settings.morningTime)}</span></div>
        <div className="remrow"><span>Evening</span><span>{fmtClock(settings.eveningTime)}</span></div>
        <div className="remrow"><span>Phone reminders</span><span>{settings.pushOn ? 'On' : 'Not turned on yet'}</span></div>
        {notice && <p className="notice">{notice}</p>}
        {!settings.pushOn && !notice && <button className="btn btn-primary" type="button" onClick={turnOn}>Turn on phone reminders</button>}
        <Link className="linkbtn" to="/settings" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Change reminder times</Link>
      </div>

      {unread.length > 0 && (
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-end' }} onClick={() => db.notifications.bulkUpdate(unread.map(n => ({ key: n.id, changes: { read: true } })))}>
          Mark all as read
        </button>
      )}

      <div className="nlist">
        {notes.length === 0 && <div className="empty"><p>No reminders yet. They’ll show up here at your reminder times, whenever a routine is planned.</p></div>}
        {notes.map(n => {
          const label = n.date === today ? (n.tod === 'am' ? 'This morning' : 'Tonight') : dayLabel(n.date, today)
          const time = n.time ? fmtClock(n.time) : fmtTime(n.createdAt)
          return (
            <button
              key={n.id}
              type="button"
              className={n.read ? 'note' : 'note unread'}
              onClick={async () => {
                if (!n.read) await db.notifications.update(n.id, { read: true })
                navigate(n.date === today ? '/' : `/day/${n.date}`)
              }}
            >
              <span className="note-when"><Icon name={n.tod === 'am' ? 'sun' : 'moon'} />{label} at {time}{n.read ? '' : ' (new)'}</span>
              {n.items.map((it, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <span className="note-r">{it.routineName}</span>
                  <span className="note-p">{it.productNames.length ? it.productNames.join(' → ') : 'No products'}</span>
                </span>
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
