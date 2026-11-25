import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../components/Toast'
import { updateSettings } from '../db/db'
import type { Settings } from '../domain/types'
import { useSettings } from '../hooks/data'
import { backupFileName, eraseEverything, exportBackup, importBackup } from '../lib/backup'
import { askForPhoneReminders, phoneReminderSupport, SUPPORT_MESSAGE } from '../lib/notify'

export function SettingsScreen() {
  const settings = useSettings()
  if (!settings) return <main className="page loading" />
  return <SettingsForm settings={settings} />
}

function SettingsForm({ settings }: { settings: Settings }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(settings.name)
  const [morning, setMorning] = useState(settings.morningTime)
  const [evening, setEvening] = useState(settings.eveningTime)
  const [remindersOn, setRemindersOn] = useState(settings.remindersOn)
  const [notice, setNotice] = useState<string>()
  const [confirm, setConfirm] = useState<'restore' | 'erase'>()
  const [restoreFile, setRestoreFile] = useState<File>()

  const save = async (e: FormEvent) => {
    e.preventDefault()
    await updateSettings({ name: name.trim(), morningTime: morning || '07:30', eveningTime: evening || '21:00', remindersOn })
    toast('Saved.')
    navigate('/')
  }

  const turnOnPhone = async () => {
    const support = phoneReminderSupport()
    if (support !== 'ok') return setNotice(SUPPORT_MESSAGE[support])
    const granted = await askForPhoneReminders()
    await updateSettings({ pushOn: granted })
    toast(granted ? 'Phone reminders are on.' : 'Phone reminders are still off.')
  }

  const download = async () => {
    const blob = await exportBackup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName()
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    toast('Your backup is downloading.')
  }

  const pickRestore = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setRestoreFile(f)
    setConfirm('restore')
  }

  const restore = async () => {
    if (!restoreFile) return
    try {
      await importBackup(restoreFile)
      toast('Your backup is restored.')
      navigate('/', { replace: true })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That backup couldn’t be restored.')
    }
    setConfirm(undefined)
  }

  const erase = async () => {
    await eraseEverything()
    navigate('/welcome', { replace: true })
  }

  return (
    <main className="page">
      <form className="form" onSubmit={save} noValidate aria-labelledby="settings-title">
        <div className="form-top">
          <h1 id="settings-title">Settings</h1>
          <button type="button" className="linkbtn" onClick={() => navigate(-1)}>Back</button>
        </div>

        <label className="field">
          <span>What should we call you? <em>(optional)</em></span>
          <input type="text" autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" />
        </label>

        <div className="row2">
          <label className="field"><span>Morning reminder</span><input type="time" value={morning} onChange={e => setMorning(e.target.value)} /></label>
          <label className="field"><span>Evening reminder</span><input type="time" value={evening} onChange={e => setEvening(e.target.value)} /></label>
        </div>

        <fieldset className="field">
          <legend>Reminders in the app</legend>
          <div className="chips">
            <label><input type="radio" name="rem" checked={remindersOn} onChange={() => setRemindersOn(true)} /><span>On</span></label>
            <label><input type="radio" name="rem" checked={!remindersOn} onChange={() => setRemindersOn(false)} /><span>Off</span></label>
          </div>
        </fieldset>

        <div className="form-actions"><button type="submit" className="btn btn-primary">Save</button></div>

        <div className="card">
          <span className="label">Phone reminders</span>
          <p>{settings.pushOn ? 'On. We’ll also remind you with a phone notification.' : 'Off. We’ll remind you inside the app.'}</p>
          {notice && <p className="notice">{notice}</p>}
          {!settings.pushOn && !notice && <button type="button" className="btn btn-ghost" onClick={turnOnPhone}>Turn on phone reminders</button>}
        </div>

        <div className="card">
          <span className="label">Your data</span>
          <p>Everything stays on this phone. Download a backup now and then, so you can bring it back if you change phones.</p>
          <div className="row2">
            <button type="button" className="btn btn-ghost" onClick={download}>Download a backup</button>
            <label className="btn btn-ghost" htmlFor="restore-file">Restore a backup</label>
          </div>
          <input type="file" id="restore-file" accept="application/json,.json" className="sr" onChange={pickRestore} />
          {confirm === 'restore' && (
            <>
              <p>Restoring replaces everything on this phone with what’s in the backup.</p>
              <div className="row2">
                <button type="button" className="btn btn-primary" onClick={restore}>Restore it</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(undefined)}>Cancel</button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          {confirm === 'erase' ? (
            <>
              <p>This deletes all your products, routines and history from this phone. It can’t be undone.</p>
              <div className="row2">
                <button type="button" className="btn btn-danger" onClick={erase}>Delete everything</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(undefined)}>Keep it</button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('erase')}>Start over</button>
          )}
        </div>
      </form>
    </main>
  )
}
