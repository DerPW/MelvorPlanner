const num = new Intl.NumberFormat('de-DE')
const num1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

export const fmtInt = (n: number) => num.format(Math.round(n))
export const fmtNum = (n: number) => (Number.isInteger(n) ? num.format(n) : num1.format(n))

/** 3 Std 12 Min · 4 Min 05 s · 12 s */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms)) return '—'
  if (ms <= 0) return '0 s'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} Min ${String(s % 60).padStart(2, '0')} s`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} Std ${m % 60} Min`
  const d = Math.floor(h / 24)
  return `${d} T ${h % 24} Std`
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
