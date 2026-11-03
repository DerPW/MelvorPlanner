// Zahlen und Dauern in der Sprache der Oberfläche (setFormatLang aus i18n)

type Lang = 'de' | 'en'

let lang: Lang = 'de'
let num = new Intl.NumberFormat('de-DE')
let num1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

const UNITS: Record<Lang, { s: string; min: string; h: string; d: string }> = {
  de: { s: 's', min: 'Min', h: 'Std', d: 'T' },
  en: { s: 's', min: 'min', h: 'h', d: 'd' },
}

export function setFormatLang(next: Lang) {
  if (next === lang) return
  lang = next
  const locale = next === 'de' ? 'de-DE' : 'en-US'
  num = new Intl.NumberFormat(locale)
  num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
}

export const fmtInt = (n: number) => num.format(Math.round(n))
export const fmtNum = (n: number) => (Number.isInteger(n) ? num.format(n) : num1.format(n))

/** 12.345 → 12,3K wie im Spiel */
export function fmtCompact(n: number): string {
  if (n >= 1e6) return `${num1.format(Math.floor(n / 1e5) / 10)}M`
  if (n >= 1e4) return `${num1.format(Math.floor(n / 1e2) / 10)}K`
  return fmtInt(n)
}

/** 3 Std 12 Min · 4 Min 05 s · 12 s */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms)) return '—'
  if (ms <= 0) return `0 ${UNITS[lang].s}`
  const u = UNITS[lang]
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} ${u.s}`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} ${u.min} ${String(s % 60).padStart(2, '0')} ${u.s}`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} ${u.h} ${m % 60} ${u.min}`
  const d = Math.floor(h / 24)
  return `${d} ${u.d} ${h % 24} ${u.h}`
}

/** Kurz für Tabellen: 3:12 h · 4:05 min · 12 s */
export function fmtDurationShort(ms: number): string {
  if (!isFinite(ms)) return '—'
  if (ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')} min`
  const h = Math.floor(m / 60)
  return `${h}:${String(m % 60).padStart(2, '0')} h`
}
