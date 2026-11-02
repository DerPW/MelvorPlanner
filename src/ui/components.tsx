import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

/** Spiel-Symbol (Item, Skill, Währung) */
export function GameIcon({ src, size = 20, alt = '', className = '' }: { src: string | null | undefined; size?: number; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="gi-missing" style={{ width: size, height: size }} aria-hidden />
  return (
    <img
      className={`gi ${className}`}
      src={src}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

// Wenige Bedien-Symbole im Stil von SF Symbols (Strich, runde Enden)
const PATHS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </>
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M3.5 8h9" />,
  close: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  check: <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  warn: (
    <>
      <path d="M8 2.75 14 13H2z" />
      <path d="M8 6.5v3M8 11.3v.2" />
    </>
  ),
  tree: (
    <>
      <path d="M3 3.5h4M5 3.5v9h4M5 8h4" />
      <rect x="9" y="6.5" width="4" height="3" rx="1" />
      <rect x="9" y="11" width="4" height="3" rx="1" />
    </>
  ),
  box: (
    <>
      <path d="M2.75 5.25 8 2.75l5.25 2.5v5.5L8 13.25l-5.25-2.5z" />
      <path d="M2.75 5.25 8 7.75l5.25-2.5M8 7.75v5.5" />
    </>
  ),
  list: (
    <>
      <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
      <path d="M2.75 4.5l.9.9 1.6-1.8M2.75 8l.9.9 1.6-1.8M2.75 11.5l.9.9 1.6-1.8" />
    </>
  ),
  reset: (
    <>
      <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.25" />
      <path d="M3.25 2.75v2.5h2.5" />
    </>
  ),
}

export function Sym({ name, size = 16, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={`sym ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 1e9,
  step = 1,
  narrow = false,
  label,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  narrow?: boolean
  label?: string
}) {
  const t = useT()
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  const commit = (raw: string) => {
    const n = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) onChange(clamp(n))
    else setText(String(value))
  }
  return (
    <span className={`stepper ${narrow ? 'narrow' : ''}`}>
      <button type="button" aria-label={t('common.less')} onClick={() => onChange(clamp(value - step))}>
        <Sym name="minus" size={12} />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step)) }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step)) }
        }}
      />
      <button type="button" aria-label={t('common.more')} onClick={() => onChange(clamp(value + step))}>
        <Sym name="plus" size={12} />
      </button>
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: string }[]
}) {
  // Der helle Hintergrund gleitet zur gewählten Taste (Lage gemessen, weil
  // die Tasten unterschiedlich breit sind)
  const box = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const active = box.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth })
  }, [value, options.map((o) => o.label).join('|')])
  return (
    <div className="segmented" role="group" ref={box}>
      {thumb && <span className="segmented-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <Sym name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toolbar({
  title,
  subtitle,
  children,
  onBack,
  backLabel,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  onBack?: () => void
  backLabel?: string
}) {
  return (
    <header className="toolbar">
      {onBack && (
        <button className="back-btn" onClick={onBack} aria-label={backLabel} title={backLabel}>
          <Sym name="chevron" size={14} />
        </button>
      )}
      <div className="toolbar-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="spacer" />
      {children}
    </header>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function Select({
  value,
  onChange,
  children,
  label,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  label: string
}) {
  return (
    <span className="select">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <Sym name="chevron" size={10} className="select-chev" />
    </span>
  )
}

export function LevelTag({ level, have }: { level: number; have: number }) {
  const t = useT()
  if (level <= 1) return null
  return (
    <span className={`lv ${have < level ? 'missing' : ''}`} title={have < level ? t('common.youHave', { level: have }) : undefined}>
      Lv {level}
    </span>
  )
}
