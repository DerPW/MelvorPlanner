import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setFormatLang } from '../core/format'
import type { Msg } from '../core/types'
import { de, type Key } from './de'
import { en } from './en'

export type Lang = 'de' | 'en'
export type LangSetting = Lang | 'auto'

const DICTS: Record<Lang, Record<Key, string>> = { de, en }
const KEY = 'melvor-planner:lang'

/** Erste passende Sprache des Browsers, sonst Englisch */
export function detectLang(): Lang {
  const list = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  for (const l of list) {
    const code = l?.toLowerCase() ?? ''
    if (code.startsWith('de')) return 'de'
    if (code.startsWith('en')) return 'en'
  }
  return 'en'
}

export type Params = Record<string, string | number | Msg | null | undefined>
// Schlüssel als Zeichenkette (auch zusammengesetzte wie `verb.${kind}`);
// scripts/check-i18n.mjs prüft, dass jeder benutzte Schlüssel in beiden
// Sprachen steht
export type T = (key: Key | Msg | (string & {}), params?: Params) => string

export function translate(lang: Lang, key: Key | Msg | (string & {}), params?: Params): string {
  if (typeof key === 'object') return translate(lang, key.key, { ...key.params, ...params } as Params)
  let s: string = DICTS[lang][key as Key] ?? DICTS.en[key as Key] ?? key
  // „ein Schritt|{n} Schritte" — Einzahl bei n = 1
  if (s.includes('|') && params && typeof params.n === 'number') s = s.split('|')[params.n === 1 ? 0 : 1]
  return s.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params?.[k]
    if (v == null) return ''
    if (typeof v === 'object') return translate(lang, v.key, v.params as Params)
    return String(v)
  })
}

interface I18n {
  lang: Lang
  setting: LangSetting
  setSetting: (s: LangSetting) => void
  t: T
  /** Intl-Gebietsschema für Datum/Zahl */
  locale: string
}

const Ctx = createContext<I18n | null>(null)

function readSetting(): LangSetting {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'de' || v === 'en' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<LangSetting>(readSetting)
  const [detected, setDetected] = useState<Lang>(detectLang)
  const lang = setting === 'auto' ? detected : setting
  // Format-Funktionen lesen die Sprache modulweit — vor dem Rendern setzen
  setFormatLang(lang)

  useEffect(() => {
    const onChange = () => setDetected(detectLang())
    window.addEventListener('languagechange', onChange)
    return () => window.removeEventListener('languagechange', onChange)
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setSetting = useCallback((s: LangSetting) => {
    setSettingState(s)
    try {
      if (s === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, s)
    } catch {
      // privat — gilt dann nur für diese Sitzung
    }
  }, [])

  const value = useMemo<I18n>(
    () => ({ lang, setting, setSetting, t: (k, p) => translate(lang, k, p), locale: lang === 'de' ? 'de-DE' : 'en-US' }),
    [lang, setting, setSetting],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('I18nProvider fehlt')
  return v
}

export const useT = () => useI18n().t
