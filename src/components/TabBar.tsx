import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink } from 'react-router'
import { db } from '../db/db'
import { Icon, type IconName } from './Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'rise' },
  { to: '/shelf', label: 'Shelf', icon: 'jar' },
  { to: '/routines', label: 'Routines', icon: 'stack' },
  { to: '/history', label: 'History', icon: 'cal' },
  { to: '/notifications', label: 'Alerts', icon: 'bell' },
]

export function TabBar() {
  const unread = useLiveQuery(() => db.notifications.filter(n => !n.read).count(), [], 0)
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <Icon name={t.icon} />
          {t.label}
          {t.to === '/notifications' && unread > 0 && <span className="badge" aria-label={`${unread} new`}>{unread}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
