import { useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { dragProgress, flatPoint, flipIn, flipOut, localPoint, measure, peelAway, restPoint, restick, setPeel, settle, type Pt } from '../lib/peel'

export interface PeelHandle {
  /** Peels the sticker off. Resolves when it's gone. */
  peel(): Promise<void>
  flipOut(): Promise<void>
  element(): HTMLElement | null
}

interface Props {
  tilt: number
  /** What's revealed underneath as the sticker peels away. */
  under?: ReactNode
  /** Shows the folded corner and lets people drag it to peel. */
  peelable?: boolean
  /** Plays the stick-back-on animation when it first appears (after undo). */
  restickOnMount?: boolean
  flipInOnMount?: boolean
  /** Called when someone peels it off by dragging the corner. */
  onPeeled?: () => void
  className?: string
  children: ReactNode
  ref?: Ref<PeelHandle>
}

export function PeelStage({ tilt, under, peelable = true, restickOnMount, flipInOnMount, onPeeled, className, children, ref }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ active: boolean; P: Pt }>({ active: false, P: [0, 0] })

  useImperativeHandle(ref, () => ({
    peel: async () => {
      const st = stageRef.current
      if (!st || st.classList.contains('peeling')) return
      await peelAway(st)
    },
    flipOut: () => flipOut(stageRef.current?.querySelector(':scope > .front') ?? null),
    element: () => stageRef.current,
  }))

  useLayoutEffect(() => {
    const st = stageRef.current
    if (!st) return
    const resting = () => (peelable ? restPoint(st) : flatPoint(st))
    measure(st)
    setPeel(st, resting())
    if (restickOnMount) void restick(st)
    if (flipInOnMount) flipIn(st.querySelector(':scope > .front'))
    const ro = new ResizeObserver(() => {
      if (st.classList.contains('peeling') || st.classList.contains('dragging')) return
      measure(st)
      setPeel(st, resting())
    })
    ro.observe(st)
    return () => ro.disconnect()
    // The mount animations run once; only the resting fold depends on peelable.
  }, [peelable])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = stageRef.current
    if (!st || st.classList.contains('peeling')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    measure(st)
    drag.current = { active: true, P: localPoint(st, e.clientX, e.clientY, tilt) }
    st.classList.add('dragging')
    setPeel(st, drag.current.P)
    e.preventDefault()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = stageRef.current
    if (!st || !drag.current.active) return
    drag.current.P = localPoint(st, e.clientX, e.clientY, tilt)
    setPeel(st, drag.current.P)
  }
  const onPointerEnd = async () => {
    const st = stageRef.current
    if (!st || !drag.current.active) return
    drag.current.active = false
    st.classList.remove('dragging')
    const P = drag.current.P
    if (dragProgress(st, P) > 0.17) {
      setImprintTime(st)
      await peelAway(st, P)
      onPeeled?.()
    } else {
      st.classList.add('peeling')
      await settle(st, P)
      st.classList.remove('peeling')
    }
  }

  return (
    <div ref={stageRef} className={className ? `stage ${className}` : 'stage'} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <div className="under" inert>{under}</div>
      <div className="front">
        {children}
        <div className="shade" />
      </div>
      <div className="flapwrap"><div className="flap" /></div>
      {peelable && (
        <div className="corner" aria-hidden="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />
      )}
    </div>
  )
}

/** The imprint under a sticker says when it was done. Set at the moment of peeling. */
export function setImprintTime(st: HTMLElement | null, text?: string): void {
  const meta = st?.querySelector<HTMLElement>(':scope > .under .imprint-meta')
  if (!meta) return
  const d = new Date()
  meta.textContent = text ?? `Done at ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`
}
