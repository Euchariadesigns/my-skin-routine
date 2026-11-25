/*
 * The sticker peel. The front is clipped along a fold line; the part past the fold is drawn
 * as the sticker's back, mirrored across that line, with a little shading. P is where the
 * bottom-right corner has been pulled to, in the sticker's own (untilted) coordinates.
 */
export type Pt = [number, number]

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Dims { W: number; H: number }
const dimsOf = new WeakMap<HTMLElement, Dims>()

export function measure(st: HTMLElement): Dims {
  const d = { W: st.offsetWidth, H: st.offsetHeight }
  dimsOf.set(st, d)
  return d
}
const dims = (st: HTMLElement) => dimsOf.get(st) ?? measure(st)

export const restPoint = (st: HTMLElement): Pt => { const { W, H } = dims(st); return [W - 38, H - 32] }
export const flatPoint = (st: HTMLElement): Pt => { const { W, H } = dims(st); return [W, H] }
const endPoint = (st: HTMLElement): Pt => { const { W, H } = dims(st); return [-1.35 * W, -1.15 * H] }
const ctrlPoint = (st: HTMLElement): Pt => { const { W, H } = dims(st); return [0.12 * W, 0.62 * H] }

function clipPoly(pts: Pt[], M: Pt, n: Pt, sign: number): Pt[] {
  const s = (p: Pt) => ((p[0] - M[0]) * n[0] + (p[1] - M[1]) * n[1]) * sign
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], sa = s(a), sb = s(b)
    if (sa <= 0) out.push(a)
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}
const poly = (pts: Pt[]) => (pts.length < 3 ? 'polygon(0 0,0 0,0 0)' : `polygon(${pts.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`)

function parts(st: HTMLElement) {
  return {
    front: st.querySelector<HTMLElement>(':scope > .front'),
    fw: st.querySelector<HTMLElement>(':scope > .flapwrap'),
    flap: st.querySelector<HTMLElement>(':scope > .flapwrap > .flap'),
    shade: st.querySelector<HTMLElement>(':scope > .front > .shade'),
  }
}

export function setPeel(st: HTMLElement, P: Pt): void {
  const { W, H } = dims(st)
  const { front, fw, flap, shade } = parts(st)
  if (!W || !front || !fw || !flap || !shade) return
  const dx = W - P[0], dy = H - P[1], len = Math.hypot(dx, dy)
  if (len < 0.5) {
    front.style.clipPath = ''
    fw.style.visibility = 'hidden'
    shade.style.backgroundImage = 'none'
    return
  }
  const n: Pt = [dx / len, dy / len]
  const M: Pt = [(W + P[0]) / 2, (H + P[1]) / 2]
  const m = 48
  front.style.clipPath = poly(clipPoly([[-m, -m], [W + m, -m], [W + m, H + m], [-m, H + m]], M, n, 1))
  flap.style.clipPath = poly(clipPoly([[0, 0], [W, 0], [W, H], [0, H]], M, n, -1))
  const k = M[0] * n[0] + M[1] * n[1]
  flap.style.transform = `matrix(${1 - 2 * n[0] * n[0]},${-2 * n[0] * n[1]},${-2 * n[0] * n[1]},${1 - 2 * n[1] * n[1]},${2 * k * n[0]},${2 * k * n[1]})`
  const ang = (Math.atan2(n[0], -n[1]) * 180) / Math.PI
  const L = Math.abs(W * n[0]) + Math.abs(H * n[1])
  const tf = (M[0] - W / 2) * n[0] + (M[1] - H / 2) * n[1] + L / 2
  flap.style.backgroundImage = `linear-gradient(${ang}deg, var(--flap-hi) ${tf}px, var(--flap) ${tf + len * 0.12}px, var(--flap-lo) ${tf + len * 0.5}px)`
  shade.style.backgroundImage = `linear-gradient(${ang}deg, transparent ${tf - 58}px, var(--shade) ${tf}px)`
  fw.style.visibility = 'visible'
}

function animate(st: HTMLElement, from: Pt, to: Pt, ctrl: Pt | null, dur: number, fade: 'in' | 'out' | null): Promise<void> {
  const { fw } = parts(st)
  const t0 = performance.now()
  const ease = fade === 'in' ? (t: number) => 1 - Math.pow(1 - t, 3) : (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  return new Promise(resolve => {
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t)
      let p: Pt
      if (ctrl) {
        const u = 1 - e
        p = [u * u * from[0] + 2 * u * e * ctrl[0] + e * e * to[0], u * u * from[1] + 2 * u * e * ctrl[1] + e * e * to[1]]
      } else p = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]
      setPeel(st, p)
      if (fw && fade === 'out') fw.style.opacity = String(t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3))
      if (fw && fade === 'in') fw.style.opacity = String(Math.min(1, t / 0.3))
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/** Peels the sticker off. Starts from the resting dog-ear, or from where a finger let go. */
export async function peelAway(st: HTMLElement, from?: Pt): Promise<void> {
  measure(st)
  st.classList.add('peeling')
  const { front, fw } = parts(st)
  if (reducedMotion()) {
    if (fw) fw.style.visibility = 'hidden'
    await front?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished
    return
  }
  if (from) await animate(st, from, endPoint(st), null, 460, 'out')
  else await animate(st, restPoint(st), endPoint(st), ctrlPoint(st), 1050, 'out')
  if (front) front.style.visibility = 'hidden'
  if (fw) fw.style.visibility = 'hidden'
}

/** Sticks a sticker back on, for undo. */
export async function restick(st: HTMLElement): Promise<void> {
  measure(st)
  const { front, fw } = parts(st)
  if (reducedMotion()) {
    await front?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }).finished
    return
  }
  st.classList.add('peeling')
  if (fw) fw.style.opacity = '0'
  setPeel(st, endPoint(st))
  await animate(st, endPoint(st), restPoint(st), ctrlPoint(st), 720, 'in')
  st.classList.remove('peeling')
  if (fw) fw.style.opacity = ''
}

export function settle(st: HTMLElement, from: Pt): Promise<void> {
  return animate(st, from, restPoint(st), null, 260, null)
}

/** A small lift of the corner, so people notice they can peel. */
export async function tease(st: HTMLElement): Promise<void> {
  if (reducedMotion() || st.classList.contains('peeling')) return
  measure(st)
  const { W, H } = dims(st)
  const r = restPoint(st), mid: Pt = [W - 108, H - 82]
  st.classList.add('peeling')
  await animate(st, r, mid, null, 520, null)
  await animate(st, mid, r, null, 560, null)
  st.classList.remove('peeling')
}

/** Converts a pointer position on screen into the sticker's untilted coordinates. */
export function localPoint(st: HTMLElement, clientX: number, clientY: number, tiltDeg: number): Pt {
  const r = st.getBoundingClientRect(), { W, H } = dims(st)
  const th = (tiltDeg * Math.PI) / 180
  const vx = clientX - (r.left + r.width / 2), vy = clientY - (r.top + r.height / 2)
  return [Math.min(W - 4, vx * Math.cos(th) + vy * Math.sin(th) + W / 2), Math.min(H - 4, -vx * Math.sin(th) + vy * Math.cos(th) + H / 2)]
}

/** How far a drag has gone, from 0 (resting) to 1 (fully off). */
export function dragProgress(st: HTMLElement, P: Pt): number {
  const { W, H } = dims(st), E = endPoint(st)
  return Math.hypot(W - P[0], H - P[1]) / Math.hypot(W - E[0], H - E[1])
}

export async function flipOut(el: HTMLElement | null): Promise<void> {
  if (!el || reducedMotion()) return
  await el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.02)' }], { duration: 170, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' }).finished
}

export function flipIn(el: HTMLElement | null): void {
  if (!el || reducedMotion()) return
  el.animate([{ transform: 'scaleX(0.02)' }, { transform: 'scaleX(1)' }], { duration: 230, easing: 'cubic-bezier(.1,.6,.3,1)' })
}
