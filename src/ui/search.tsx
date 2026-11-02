// Globale Suche = Befehlspalette. Jede Sorte (Ansichten, Aktionen, Items,
// Skills, Monster, Gebiete, Shop, Rezepte) meldet sich hier mit ihren
// Einträgen an; eine neue Sorte ist ein weiterer Eintrag in KINDS.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type LangSetting, type T } from '../i18n'
import { newRoute, routeIcon, routeLabel } from './routeText'
import { GameIcon, Sym } from './components'
import { recipeAction } from './SolutionView'
import { itemRoute, useGame, type Action, type DetailType, type State } from './state'
import { PICK_ITEM_EVENT, useUi } from './ui'
import type { GameIndex } from '../core/planner'

export interface Entry {
  key: string
  name: string
  icon?: string | null
  sub?: string
  /** weitere Suchwörter (englische/deutsche Namen der Ansicht, Kategorie …) */
  keywords?: string
  run: () => void
}

interface Ctx {
  index: GameIndex
  state: State
  dispatch: (a: Action) => void
  t: T
  setLang: (s: LangSetting) => void
  ui: ReturnType<typeof useUi>
}

interface Kind {
  id: string
  group: string
  entries: (c: Ctx) => Entry[]
}

const ui = (name: string) => `game/icons/Icons/${name}.webp`
const detail = (c: Ctx, type: DetailType, id: string) => () => c.dispatch({ type: 'view', view: { kind: 'detail', type, id }, root: true })

export const KINDS: Kind[] = [
  {
    id: 'view',
    group: 'search.group.views',
    entries: (c) => [
      { key: 'view:routes', name: c.t('home.title'), icon: ui('CompletionLog'), keywords: 'routen routes ziele goals crafting plan baum tree', run: () => c.dispatch({ type: 'view', view: { kind: 'routes' }, root: true }) },
      { key: 'view:combat', name: c.t('combat.title'), icon: ui('Combat'), keywords: 'kampf combat monster ausrüstung equipment gear', run: () => c.dispatch({ type: 'view', view: { kind: 'combat' }, root: true }) },
      { key: 'view:gear', name: c.t('gear.title'), icon: ui('Combat'), keywords: 'ausrüstung vergleich equipment gear compare upgrade', run: () => c.dispatch({ type: 'view', view: { kind: 'gear' }, root: true }) },
      { key: 'view:bank', name: c.t('bank.title'), icon: ui('Bank'), keywords: 'bank lager inventory items stock', run: () => c.dispatch({ type: 'view', view: { kind: 'bank' }, root: true }) },
      { key: 'view:shop', name: c.t('shop.title'), icon: ui('Shop'), keywords: 'shop kaufen buy upgrades', run: () => c.dispatch({ type: 'view', view: { kind: 'shop' }, root: true }) },
      { key: 'view:wiki', name: c.t('wiki.title'), icon: ui('codex'), keywords: 'wiki alle items monster gebiete liste browse', run: () => c.dispatch({ type: 'view', view: { kind: 'wiki' }, root: true }) },
      { key: 'view:live', name: c.t('live.view'), icon: ui('Mastery_Icon'), keywords: 'live jetzt aktion messung verbrauch tempo', run: () => c.dispatch({ type: 'view', view: { kind: 'live' }, root: true }) },
      { key: 'view:mastery', name: c.t('mastery.title'), icon: ui('Mastery_Icon'), keywords: 'mastery gilde guild rang aufgaben tasks', run: () => c.dispatch({ type: 'view', view: { kind: 'mastery' }, root: true }) },
      { key: 'view:stats', name: c.t('stats.title'), icon: ui('Statistics_64'), keywords: 'statistiken statistics spielzeit zähler', run: () => c.dispatch({ type: 'view', view: { kind: 'stats' }, root: true }) },
      { key: 'view:guide', name: c.t('guide.title'), icon: ui('GuideBook'), keywords: 'guide tutorial anleitung hilfe', run: () => c.dispatch({ type: 'view', view: { kind: 'guide' }, root: true }) },
      { key: 'view:quests', name: c.t('quests.title'), icon: ui('Quests'), keywords: 'quests aufträge akt story', run: () => c.dispatch({ type: 'view', view: { kind: 'quests' }, root: true }) },
      { key: 'view:editor', name: c.t('edit.title'), icon: ui('Edit'), keywords: 'editor spielstand bearbeiten save cheat ändern', run: () => c.dispatch({ type: 'view', view: { kind: 'editor' }, root: true }) },
      { key: 'view:completion', name: c.t('completion.title'), icon: ui('Milestones'), keywords: 'completion fortschritt log gefunden', run: () => c.dispatch({ type: 'view', view: { kind: 'completion' }, root: true }) },
      { key: 'view:profile', name: c.t('profile.title'), icon: ui('Bank'), keywords: 'profil profile bank lager settings einstellungen', run: () => c.dispatch({ type: 'view', view: { kind: 'profile' }, root: true }) },
      ...c.state.routes.map((r) => ({
        key: `route:${r.id}`,
        name: routeLabel(c.index, r),
        icon: routeIcon(c.index, r),
        sub: c.t(`route.kind.${r.kind}`),
        keywords: 'route',
        run: () => c.dispatch({ type: 'view', view: { kind: 'route', id: r.id }, root: true }),
      })),
    ],
  },
  {
    id: 'action',
    group: 'search.group.actions',
    entries: (c) => {
      const add = (kind: 'level' | 'gold' | 'unlock') => () => {
        const route = newRoute(c.index, c.state.profile, kind)
        if (route) c.dispatch({ type: 'addRoute', route, root: true })
      }
      const pickItem = () => {
        c.dispatch({ type: 'view', view: { kind: 'routes' }, root: true })
        setTimeout(() => window.dispatchEvent(new Event(PICK_ITEM_EVENT)), 60)
      }
      const toggle = (key: keyof State['options'], label: string) => ({
        key: `opt:${key}`,
        name: `${label}: ${c.t(c.state.options[key] ? 'search.turnOff' : 'search.turnOn')}`,
        keywords: 'option einstellung setting',
        run: () => c.dispatch({ type: 'setOption', options: { [key]: !c.state.options[key] } }),
      })
      return [
        { key: 'act:item', name: c.t('home.item'), keywords: 'route item herstellen craft neu new', run: pickItem },
        { key: 'act:level', name: c.t('nav.addLevel'), keywords: 'route level neu new', run: add('level') },
        { key: 'act:gold', name: c.t('nav.addGold'), keywords: 'route gold gp neu new', run: add('gold') },
        { key: 'act:unlock', name: c.t('nav.addUnlock'), keywords: 'route shop unlock freischaltung', run: add('unlock') },
        { key: 'act:import', name: c.t('import.button'), keywords: 'save spielstand import sav', run: c.ui.openImport },
        { key: 'act:notes', name: c.t('notes.title'), keywords: 'release notes neuigkeiten version changelog', run: c.ui.openNotes },
        toggle('bonuses', c.t('opt.bonuses')),
        toggle('smart', c.t('opt.smart')),
        toggle('includeMaterials', c.t('opt.materials')),
        { key: 'lang:de', name: `${c.t('lang.label')}: Deutsch`, keywords: 'language sprache german', run: () => c.setLang('de') },
        { key: 'lang:en', name: `${c.t('lang.label')}: English`, keywords: 'language sprache englisch', run: () => c.setLang('en') },
        { key: 'lang:auto', name: `${c.t('lang.label')}: ${c.t('lang.auto')}`, keywords: 'language sprache browser', run: () => c.setLang('auto') },
      ]
    },
  },
  {
    id: 'item',
    group: 'search.group.items',
    entries: (c) =>
      c.index.data.items.map((i) => ({
        key: `item:${i.id}`,
        name: i.name,
        icon: i.icon,
        sub: itemRoute(c.state, i.id) ? c.t('search.inRoute') : undefined,
        run: detail(c, 'item', i.id),
      })),
  },
  {
    id: 'skill',
    group: 'search.group.skills',
    entries: (c) =>
      c.index.data.skills.map((s) => ({
        key: `skill:${s.id}`,
        name: s.name,
        icon: s.icon,
        sub: `Level ${c.state.profile.levels[s.id] ?? 1}`,
        run: () => c.dispatch({ type: 'view', view: { kind: 'skill', skill: s.id }, root: true }),
      })),
  },
  {
    id: 'enemy',
    group: 'search.group.enemies',
    entries: (c) =>
      (c.index.data.enemies ?? []).map((e) => ({
        key: `enemy:${e.id}`,
        name: e.name,
        icon: e.icon,
        keywords: 'monster enemy gegner',
        run: detail(c, 'enemy', e.id),
      })),
  },
  {
    id: 'area',
    group: 'search.group.areas',
    entries: (c) =>
      (c.index.data.areas ?? []).map((a) => ({
        key: `area:${a.id}`,
        name: a.name,
        icon: a.icon ?? ui('Combat'),
        sub: a.category ?? undefined,
        keywords: `${a.kind === 'dungeon' ? 'dungeon' : 'zone gebiet area'} ${a.difficulty ?? ''}`,
        run: detail(c, 'area', a.id),
      })),
  },
  {
    id: 'purchase',
    group: 'search.group.shop',
    entries: (c) =>
      c.index.data.purchases
        .filter((p) => !p.demoLocked)
        .map((p) => ({
          key: `purchase:${p.id}`,
          name: p.name,
          icon: p.icon,
          sub: p.category ?? undefined,
          keywords: 'shop upgrade kaufen buy',
          run: detail(c, 'purchase', p.id),
        })),
  },
  {
    id: 'recipe',
    group: 'search.group.recipes',
    entries: (c) =>
      c.index.data.recipes
        .filter((r) => !r.demoLocked && r.kind !== 'shop' && r.outputs[0])
        .map((r) => ({
          key: `recipe:${r.id}`,
          name: recipeAction(c.t, r),
          icon: r.icon,
          sub: r.skill ? c.index.skills.get(r.skill)?.name : undefined,
          keywords: r.name,
          run: detail(c, 'item', r.outputs[0].item),
        })),
  },
]

// --- Suche

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function score(e: Entry, words: string[]): number {
  const name = fold(e.name)
  const hay = `${name} ${fold(e.keywords ?? '')} ${fold(e.sub ?? '')}`
  if (!words.every((w) => hay.includes(w))) return -1
  const q = words.join(' ')
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (name.split(/\s+/).some((w) => w.startsWith(words[0]))) return 2
  if (name.includes(q)) return 3
  return 4
}

const RECENT = 'melvor-planner:recentSearch'
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]')
  } catch {
    return []
  }
}

/** Suchfeld oben in der Seitenleiste; ⌘K springt von überall hinein */
export function GlobalSearch() {
  const { index, state, dispatch } = useGame()
  const { t, setSetting, lang } = useI18n()
  const uiCtx = useUi()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
        setOpen(true)
      }
    }
    const focus = () => {
      input.current?.focus()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('melvor:focus-search', focus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('melvor:focus-search', focus)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // Einträge erst bauen, wenn die Palette offen ist
  const groups = useMemo(() => {
    if (!open) return []
    const ctx: Ctx = { index, state, dispatch, t, setLang: setSetting, ui: uiCtx }
    const all = KINDS.map((k) => ({ kind: k, entries: k.entries(ctx) }))
    const words = fold(q.trim()).split(/\s+/).filter(Boolean)
    if (!words.length) {
      const recent = readRecent()
      const byKey = new Map(all.flatMap((g) => g.entries.map((e) => [e.key, e] as const)))
      const recentEntries = recent.map((k) => byKey.get(k)).filter((e): e is Entry => !!e)
      return [
        ...(recentEntries.length ? [{ group: 'search.group.recent', entries: recentEntries }] : []),
        { group: 'search.group.views', entries: all[0].entries },
        { group: 'search.group.actions', entries: all[1].entries.slice(0, 5) },
      ]
    }
    return all
      .map(({ kind, entries }) => ({
        group: kind.group,
        entries: entries
          .map((e) => ({ e, s: score(e, words) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
          .slice(0, kind.id === 'item' || kind.id === 'recipe' ? 8 : 5)
          .map((x) => x.e),
      }))
      .filter((g) => g.entries.length)
    // lang: Namen der Ansichten/Aktionen hängen an der Sprache
  }, [open, q, index, state, dispatch, t, setSetting, uiCtx, lang])

  const flat = groups.flatMap((g) => g.entries)
  useEffect(() => setActive(0), [q])
  useEffect(() => {
    list.current?.querySelector('.pop-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (e: Entry) => {
    try {
      localStorage.setItem(RECENT, JSON.stringify([e.key, ...readRecent().filter((k) => k !== e.key)].slice(0, 8)))
    } catch {
      // ohne Speicher kein Verlauf
    }
    e.run()
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  let i = 0
  return (
    <div className="global-search" ref={wrap}>
      <div className="search">
        <Sym name="search" size={15} className="sym-lead" />
        <input
          ref={input}
          value={q}
          placeholder={t('search.global')}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(flat.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if ((e.key === 'Enter' || e.keyCode === 13) && flat[active]) {
              e.preventDefault()
              run(flat[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
        />
        {!q && <kbd>⌘K</kbd>}
      </div>
      {open && (
        <div className="popover palette" role="listbox" ref={list}>
          {flat.length === 0 && <div className="pop-empty">{t('search.nothing')}</div>}
          {groups.map((g) => (
            <div key={g.group} className="palette-group">
              <div className="palette-label">{t(g.group)}</div>
              {g.entries.map((e) => {
                const idx = i++
                return (
                  <button
                    key={e.key}
                    role="option"
                    aria-selected={idx === active}
                    className={`pop-row ${idx === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(e)}
                  >
                    {e.icon ? <GameIcon src={e.icon} size={20} /> : <span className="palette-dot" />}
                    <span className="grow">{e.name}</span>
                    {e.sub && <span className="palette-sub">{e.sub}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
