const PATHS = {
  sun: 'M12 8.3c2.1-.1 3.8 1.6 3.8 3.7 0 2.1-1.7 3.8-3.8 3.8s-3.8-1.7-3.7-3.8c0-2 1.6-3.6 3.7-3.7zM12 2.9v2.4M12.1 18.8v2.3M2.9 12h2.4M18.7 12.1h2.4M5.5 5.5l1.7 1.7M16.8 16.9l1.7 1.6M5.6 18.5l1.6-1.7M16.9 7.1l1.7-1.6',
  moon: 'M19.4 14.7c-1 .4-2.1.6-3.2.6-4.5 0-8-3.6-8-8 0-1.2.2-2.3.7-3.3-3.1 1.2-5.2 4.2-5.2 7.6 0 4.6 3.7 8.3 8.3 8.3 3.3 0 6.2-2 7.4-5.2z',
  check: 'M4.6 12.9c1.5 1.3 2.9 2.8 4.2 4.5 2.6-4.4 6-8.3 10.5-11.1',
  dash: 'M6 12.3c3.9-.5 7.9-.4 12 .1',
  bell: 'M6.3 16.6c.9-1.1 1.2-2.4 1.2-4.1.1-3 1.6-5.3 4.6-5.4 3 0 4.4 2.3 4.5 5.3 0 1.8.4 3.1 1.3 4.2zM10.3 19.3c.5.9 1.1 1.3 1.8 1.3s1.3-.4 1.7-1.3M12 4.8V7',
  jar: 'M7.1 9.3h10c.6 0 1 .4 1 1v8.7c0 .9-.7 1.6-1.6 1.6H7.6c-.9 0-1.6-.7-1.6-1.6v-8.6c.1-.6.5-1.1 1.1-1.1zM7.8 5.3h8.5v4H7.8zM9.2 14.3h5.7',
  stack: 'M4.9 8.5l7.1-3.6 7.1 3.6-7.1 3.6zM4.9 12.3l7.1 3.6 7.1-3.6M4.9 16.1l7.1 3.6 7.1-3.6',
  cal: 'M5.2 6.6h13.6c.6 0 1 .4 1 1v11.5c0 .6-.4 1-1 1H5.1c-.6 0-1-.4-1-1V7.6c.1-.6.5-1 1.1-1zM4.3 10.4h15.3M8.6 4.2v3.5M15.4 4.2v3.5',
  rise: 'M3.6 17.5h16.8M7.3 17.4c0-2.7 2.1-4.8 4.7-4.8s4.8 2.1 4.8 4.8M12 6.3v2.4M5.6 9.4l1.6 1.5M18.5 9.3l-1.6 1.6M8 20.5h8',
  plus: 'M12 5.4v13.2M5.4 12.1h13.2',
  drop: 'M12 3.9c2.6 3.4 5.2 6.6 5.2 9.8 0 2.9-2.3 5.3-5.2 5.3s-5.2-2.4-5.2-5.3c0-3.2 2.6-6.4 5.2-9.8z',
  camera: 'M4.5 8.3h3l1.4-2.1h6.2l1.4 2.1h3c.6 0 1 .4 1 1v8.9c0 .6-.4 1-1 1h-15c-.6 0-1-.4-1-1V9.3c0-.6.4-1 1-1zM12 10.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z',
  sliders: 'M5 7.2h9M18 7.2h1M5 12.1h3M12 12h7M5 16.9h11M19.4 16.9h-.4M15.9 5.4v3.6M9.9 10.3v3.6M17.6 15.1v3.6',
  left: 'M14.5 6.5L9 12l5.5 5.5',
  right: 'M9.5 6.5L15 12l-5.5 5.5',
  close: 'M7 7.2c3.4 3.1 6.7 6.4 9.9 9.7M16.9 7.1c-3.3 3.2-6.6 6.5-9.8 9.8',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span className={className ? `ic ${className}` : 'ic'} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={PATHS[name]} />
      </svg>
    </span>
  )
}

export const categoryIcon = (category?: string): IconName => {
  const c = (category || '').toLowerCase()
  if (c.includes('moist') || c.includes('cream')) return 'jar'
  if (c.includes('sun') || c.includes('spf')) return 'sun'
  return 'drop'
}
