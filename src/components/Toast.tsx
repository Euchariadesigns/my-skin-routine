import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [on, setOn] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    setOn(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOn(false), 2800)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={on ? 'toast on' : 'toast'} role="status" aria-live="polite">{message}</div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
