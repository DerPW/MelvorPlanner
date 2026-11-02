import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { applyBonuses } from '../core/bonuses'
import { COMBAT_SKILLS } from '../core/combat'
import { withCombat } from '../core/combatSources'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import type { GameIndex } from '../core/planner'
import { useI18n, type LangSetting } from '../i18n'
import { GameIcon, Sym } from './components'
import { Breadcrumbs } from './Breadcrumbs'
import { CombatView } from './CombatView'
import { BankView } from './BankView'
import { CompletionView } from './CompletionView'
import { GearView } from './GearView'
import { ShopView } from './ShopView'
import { WikiView } from './WikiView'
import { LiveView } from './LiveView'
import { DetailView } from './DetailView'
import { EntityHover } from './EntityHover'
import { ImportSheet } from './ImportSheet'
import { Inspector } from './Inspector'
import { LiveSyncProvider, useLive } from './LiveSync'
import { LiveCard, TrackProvider, useTrack } from './LiveTrack'
import { ProfileView } from './ProfileView'
import { ReleaseNotes, useReleaseNotesOnUpdate } from './ReleaseNotes'
import { newRoute, routeEntity, routeIcon, routeLabel } from './routeText'
import { RoutesHome } from './RoutesHome'
import { featureLock } from './SolutionView'
import { RouteView } from './RouteView'
import { GlobalSearch } from './search'
import { SkillView } from './SkillView'
import { GameContext, loadState, reducer, saveState, useGame } from './state'
import { PICK_ITEM_EVENT, UiContext, useUi } from './ui'

export function App({ index }: { index: GameIndex }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  // Monster als Quellen — neu, wenn sich Kampf-Level, Ausrüstung oder Lager-Essen ändern
  const combatKey = JSON.stringify([COMBAT_SKILLS.map((s) => state.profile.levels[s]), state.profile.combat, state.profile.unlocked])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gameIndex = useMemo(() => withCombat(index, state.profile), [index, combatKey])
  const bonus = useMemo(() => applyBonuses(gameIndex, state.profile, state.options.bonuses), [gameIndex, state.profile, state.options.bonuses])
  const [notesOpen, setNotesOpen] = useReleaseNotesOnUpdate()
  const [importOpen, setImportOpen] = useState(false)
  const ui = useMemo(() => ({ openImport: () => setImportOpen(true), openNotes: () => setNotesOpen(true) }), [setNotesOpen])

  const view = state.view
  const viewKey =
    view.kind === 'route'
      ? `route:${view.id}`
      : view.kind === 'skill'
        ? `skill:${view.skill}`
        : view.kind === 'detail'
          ? `${view.type}:${view.id}`
          : view.kind === 'wiki'
            ? `wiki:${view.section ?? ''}:${view.group ?? ''}`
            : view.kind
  let main
  if (view.kind === 'profile') main = <ProfileView />
  else if (view.kind === 'combat') main = <CombatView />
  else if (view.kind === 'gear') main = <GearView />
  else if (view.kind === 'bank') main = <BankView />
  else if (view.kind === 'shop') main = <ShopView />
  else if (view.kind === 'wiki') main = <WikiView section={view.section} group={view.group} />
  else if (view.kind === 'completion') main = <CompletionView />
  else if (view.kind === 'live') main = <LiveView />
  else if (view.kind === 'skill') main = <SkillView skill={view.skill} />
  else if (view.kind === 'detail') main = <DetailView type={view.type} id={view.id} />
  else if (view.kind === 'route' && state.routes.some((r) => r.id === view.id)) main = <RouteView id={view.id} />
  else main = <RoutesHome />

  return (
    <GameContext.Provider value={{ index: bonus.index, baseIndex: gameIndex, bonus, state, dispatch }}>
      <UiContext.Provider value={ui}>
        <LiveSyncProvider>
          <TrackProvider>
            <div className={`window ${state.selected ? '' : 'no-inspector'}`}>
              <Sidebar />
              <div className="main-col">
                <Breadcrumbs />
                <main className="main view-in" key={viewKey}>
                  {main}
                </main>
              </div>
              {state.selected && (
                <aside className={`inspector ${state.inspectorOpen ? '' : 'closed'}`}>
                  <Inspector item={state.selected} key={state.selected} />
                </aside>
              )}
            </div>
            {notesOpen && <ReleaseNotes onClose={() => setNotesOpen(false)} />}
            {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
            <EntityHover />
          </TrackProvider>
        </LiveSyncProvider>
      </UiContext.Provider>
    </GameContext.Provider>
  )
}

function Sidebar() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const meta = index.data.meta
  const v = state.view
  const ui = (name: string) => `game/icons/Icons/${name}.webp`

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <div className="app-mark">
          <img src={ui('Milestones')} alt="" />
        </div>
        <div>
          <div className="app-title">Melvor Planner</div>
          <div className="app-sub">
            {meta.packages.join(', ')}
            {meta.gameVersion ? ` · ${meta.gameVersion}` : ''}
          </div>
        </div>
      </div>
      <GlobalSearch />

      <div className="sidebar-scroll">
        <div className="side-section" style={{ marginTop: 4 }}>
          <NavRow kind="routes" icon={ui('CompletionLog')} label={t('home.title')} badge={state.routes.length || undefined} />
          <NavRow kind="wiki" icon={ui('GuideBook')} label={t('wiki.title')} />
        </div>
        <div className="side-section">
          <div className="side-label">{t('nav.game')}</div>
          <LiveNav />
          <NavRow kind="bank" icon={ui('Bank')} label={t('bank.title')} badge={Object.keys(state.profile.inventory).length || undefined} />
          <NavRow kind="shop" icon={ui('Shop')} label={t('shop.title')} locked={!!featureLock(index, state.profile, 'MelvorBase:Shop')} />
          <NavRow kind="combat" icon={ui('Combat')} label={t('combat.title')} locked={!!featureLock(index, state.profile, 'MelvorBase:Combat')} />
          <NavRow kind="gear" icon={index.items.get('MelvorBase:IronHelmet')?.icon ?? ui('Combat')} label={t('gear.title')} />
          <NavRow kind="completion" icon={ui('Milestones')} label={t('completion.title')} />
          <NavRow kind="profile" icon={ui('Mastery_Icon')} label={t('profile.title')} extra={<LiveBadge />} />
        </div>

        <div className="side-section">
          <div className="side-label">
            {t('nav.routes')}
            <AddRouteMenu />
          </div>
          {state.routes.length === 0 && <div className="side-empty">{t('nav.routesEmpty')}</div>}
          {state.routes.map((r) => (
            <button
              key={r.id}
              data-entity={routeEntity(r) ?? undefined}
              className={`side-row removable ${v.kind === 'route' && v.id === r.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: r.id }, root: true })}
            >
              <GameIcon src={routeIcon(index, r)} size={18} />
              <span className="grow">{routeLabel(index, r)}</span>
              {state.activeRoute === r.id && <i className="live-dot" title={t('track.active')} />}
              {r.kind === 'item' && <span className="badge">×{fmtInt(r.qty)}</span>}
              <span
                className="side-remove"
                role="button"
                tabIndex={0}
                aria-label={t('route.remove')}
                title={t('route.remove')}
                onClick={(e) => {
                  e.stopPropagation()
                  dispatch({ type: 'removeRoute', id: r.id })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch({ type: 'removeRoute', id: r.id })
                  }
                }}
              >
                <Sym name="close" size={11} />
              </span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <div className="side-label">{t('nav.skills')}</div>
          {index.data.skills
            .filter((s) => index.data.recipes.some((r) => r.skill === s.id && r.xp > 0))
            .map((s) => (
              <button
                key={s.id}
                data-entity={`skill:${s.id}`}
                className={`side-row ${v.kind === 'skill' && v.skill === s.id ? 'active' : ''} ${featureLock(index, state.profile, s.id) ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'view', view: { kind: 'skill', skill: s.id }, root: true })}
              >
                <GameIcon src={s.icon} size={18} />
                <span className="grow">{s.name}</span>
                {featureLock(index, state.profile, s.id) ? (
                  <Sym name="lock" size={12} className="side-lock" />
                ) : (
                  <span className="badge">{state.profile.levels[s.id] ?? 1}</span>
                )}
              </button>
            ))}
        </div>
      </div>

      <LiveCard />
      <SidebarFooter />
    </nav>
  )
}

/** Eintrag der Seitenleiste für eine Ansicht */
/** Live in der Seitenleiste: mit dem Symbol dessen, was gerade läuft */
function LiveNav() {
  const { state } = useGame()
  const { t } = useI18n()
  const { action } = useTrack()
  const icon = action?.recipe?.icon ?? action?.enemy?.icon ?? action?.skill?.icon ?? 'game/icons/Icons/Mastery_Icon.webp'
  return <NavRow kind="live" icon={icon} label={t('live.view')} extra={state.live ? <i className={action ? 'live-dot' : 'live-dot off'} /> : undefined} />
}

function NavRow({ kind, icon, label, badge, locked, extra }: { kind: 'routes' | 'wiki' | 'live' | 'bank' | 'shop' | 'combat' | 'gear' | 'completion' | 'profile'; icon: string | null | undefined; label: string; badge?: number; locked?: boolean; extra?: React.ReactNode }) {
  const { state, dispatch } = useGame()
  return (
    <button className={`side-row ${state.view.kind === kind ? 'active' : ''} ${locked ? 'locked' : ''}`} onClick={() => dispatch({ type: 'view', view: { kind }, root: true })}>
      <img src={icon ?? undefined} alt="" />
      <span className="grow">{label}</span>
      {locked && <Sym name="lock" size={12} className="side-lock" />}
      {!locked && badge != null && <span className="badge">{badge}</span>}
      {extra}
    </button>
  )
}

function SidebarFooter() {
  const { t, setting, setSetting } = useI18n()
  const { openNotes } = useUi()
  return (
    <div className="sidebar-foot">
      <button className="version" onClick={openNotes} title={t('notes.open')}>
        v{__APP_VERSION__}
        <span>{t('notes.whatsNew')}</span>
      </button>
      <label className="lang" title={t('lang.label')}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2c2 2 2.6 4 2.6 6S10 12 8 14M8 2C6 4 5.4 6 5.4 8S6 12 8 14" />
        </svg>
        <select aria-label={t('lang.label')} value={setting} onChange={(e) => setSetting(e.target.value as LangSetting)}>
          <option value="auto">{t('lang.auto')}</option>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  )
}

/** Sinnbild für „Item herstellen" */
export const ITEM_ICON = 'MelvorBase:IronBar'

function AddRouteMenu() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  // Das Menü hängt am Body: in der scrollenden Seitenleiste wurde es
  // abgeschnitten und lag unter dem Hauptbereich
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const setOpen = (v: boolean) => {
    const r = button.current?.getBoundingClientRect()
    setAt(v && r ? { left: Math.max(8, r.right - 230), top: r.bottom + 6 } : null)
  }
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const n = e.target as Node
      if (!menu.current?.contains(n) && !button.current?.contains(n)) setAt(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null)
    const away = () => setAt(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', away)
    }
  }, [open])

  const add = (kind: 'level' | 'gold' | 'unlock') => {
    const route = newRoute(index, state.profile, kind)
    if (route) dispatch({ type: 'addRoute', route, root: true })
    setOpen(false)
  }
  // Item: auf der Übersicht im Suchfeld wählen
  const pickItem = () => {
    dispatch({ type: 'view', view: { kind: 'routes' }, root: true })
    setOpen(false)
    setTimeout(() => window.dispatchEvent(new Event(PICK_ITEM_EVENT)), 60)
  }
  const level = newRoute(index, state.profile, 'level')
  const unlock = newRoute(index, state.profile, 'unlock')

  return (
    <>
      <button ref={button} aria-label={t('nav.addRoute')} title={t('nav.addRoute')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Sym name="plus" size={13} />
      </button>
      {at &&
        createPortal(
          <div ref={menu} className="popover floating" style={{ left: at.left, top: at.top, width: 230 }}>
            <button className="pop-row" onClick={pickItem}>
              <GameIcon src={index.items.get(ITEM_ICON)?.icon} size={20} />
              <span className="grow">{t('home.item')}</span>
            </button>
            <button className="pop-row" onClick={() => add('level')}>
              <GameIcon src={level ? routeIcon(index, level) : null} size={20} />
              <span className="grow">{t('nav.addLevel')}</span>
            </button>
            <button className="pop-row" onClick={() => add('gold')}>
              <GameIcon src={index.currencies.get(GP)?.icon} size={20} />
              <span className="grow">{t('nav.addGold')}</span>
            </button>
            {unlock && (
              <button className="pop-row" onClick={() => add('unlock')}>
                <GameIcon src={routeIcon(index, unlock)} size={20} />
                <span className="grow">{t('nav.addUnlock')}</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function LiveBadge() {
  const { state } = useGame()
  const { t } = useI18n()
  const live = useLive()
  if (!state.live || !live.saves) return null
  return (
    <span className={`live-badge ${live.error ? 'warn' : ''}`} title={live.error ? t(live.error) : t('live.badgeHint')}>
      <i /> live
    </span>
  )
}
