import type { CSSProperties, ReactElement } from 'react'

/** Plain product shapes for examples and decoration. No brands, no labels. */
const SHAPES: Record<ArtShape, ReactElement> = {
  pump: (
    <svg viewBox="0 0 80 112" aria-hidden="true"><rect className="d" x="29" y="8" width="26" height="8" rx="3" /><rect className="d" x="51" y="9" width="15" height="5" rx="2.5" /><rect className="d" x="35" y="16" width="12" height="16" rx="2" /><rect className="b" x="15" y="31" width="52" height="74" rx="11" /><rect className="l" x="23" y="52" width="36" height="30" rx="4" /><rect className="k" x="28" y="60" width="22" height="3" rx="1.5" /><rect className="k" x="28" y="68" width="14" height="3" rx="1.5" /></svg>
  ),
  dropper: (
    <svg viewBox="0 0 80 112" aria-hidden="true"><rect className="d" x="32" y="6" width="16" height="28" rx="8" /><rect className="d" x="27" y="31" width="26" height="12" rx="3" /><rect className="b" x="14" y="42" width="52" height="63" rx="13" /><rect className="l" x="22" y="58" width="36" height="27" rx="4" /><rect className="k" x="28" y="66" width="24" height="3" rx="1.5" /><rect className="k" x="28" y="74" width="14" height="3" rx="1.5" /></svg>
  ),
  tube: (
    <svg viewBox="0 0 80 112" aria-hidden="true"><path className="b" d="M18 9h44l-6 74H24z" /><rect className="d" x="16" y="6" width="48" height="8" rx="2" /><rect className="d" x="26" y="82" width="28" height="23" rx="4" /><rect className="l" x="27" y="28" width="26" height="32" rx="3" /><rect className="k" x="31" y="37" width="18" height="3" rx="1.5" /><rect className="k" x="31" y="45" width="11" height="3" rx="1.5" /></svg>
  ),
  jar: (
    <svg viewBox="0 0 80 112" aria-hidden="true"><rect className="d" x="13" y="40" width="54" height="16" rx="5" /><rect className="b" x="9" y="54" width="62" height="50" rx="12" /><rect className="l" x="19" y="66" width="42" height="24" rx="4" /><rect className="k" x="26" y="74" width="26" height="3" rx="1.5" /><rect className="k" x="26" y="81" width="15" height="3" rx="1.5" /></svg>
  ),
  bottle: (
    <svg viewBox="0 0 80 112" aria-hidden="true"><rect className="d" x="31" y="6" width="18" height="19" rx="3" /><rect className="b" x="34" y="24" width="12" height="11" /><rect className="b" x="17" y="33" width="46" height="72" rx="11" /><rect className="l" x="24" y="52" width="32" height="34" rx="4" /><rect className="k" x="29" y="61" width="22" height="3" rx="1.5" /><rect className="k" x="29" y="69" width="14" height="3" rx="1.5" /></svg>
  ),
}

export type ArtShape = 'pump' | 'dropper' | 'tube' | 'jar' | 'bottle'
export type ArtColor = 'sky' | 'butter' | 'blush' | 'sage' | 'lilac' | 'peach'

export function Art({ shape, color, className, style }: { shape: ArtShape; color: ArtColor; className?: string; style?: CSSProperties }) {
  return (
    <span className={className ? `art ${className}` : 'art'} style={{ '--c': `var(--${color})`, ...style } as CSSProperties}>
      {SHAPES[shape]}
    </span>
  )
}
