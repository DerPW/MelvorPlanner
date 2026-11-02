import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { applyBonuses } from '../core/bonuses'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import type { GameIndex } from '../core/planner'
import { useI18n, type LangSetting } from '../i18n'
import { GameIcon, Sym } from './components'
import { DetailView } from './DetailView'
import { EntityHover } from './EntityHover'
import { ImportSheet } from './ImportSheet'
import { Inspector } from './Inspector'
import { LiveSyncProvider, useLive } from './LiveSync'
import { PlanView } from './PlanView'
import { ProfileView } from './ProfileView'
import { ReleaseNotes, useReleaseNotesOnUpdate } from './ReleaseNotes'
import { routeIcon, routeLabel } from './routeText'
import { RouteView } from './RouteView'
import { GlobalSearch } from './search'
import { SkillView } from './SkillView'
import { GameContext, loadState, newId, reducer, saveState, useGame, type RouteTarget } from './state'
import { UiContext, useUi } from './ui'

export function App({ index }: { index: GameIndex }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  const bonus = useMemo(() => applyBonuses(index, state.profile, state.options.bonuses), [index, state.profile, state.options.bonuses])
  const [notesOpen, setNotesOpen] = useReleaseNotesOnUpdate()
  const [importOpen, setImportOpen] = useState(false)
  const ui = useMemo(() => ({ openImport: () => setImportOpen(true), openNotes: () => setNotesOpen(true) }), [setNotesOpen])

  const view = state.view
  const viewKey =
    view.kind === 'route' ? `route:${view.id}` : view.kind === 'skill' ? `skill:${view.skill}` : view.kind === 'detail' ? `${view.type}:${view.id}` : view.kind
  let main
  if (view.kind === 'profile') main = <ProfileView />
  else if (view.kind === 'skill') main = <SkillView skill={view.skill} />
  else if (view.kind === 'detail') main = <DetailView type={view.type} id={view.id} />
  else if (view.kind === 'route' && state.routes.some((r) => r.id === view.id)) main = <RouteView id={view.id} />
  else main = <PlanView />

  return (
    <GameContext.Provider value={{ index: bonus.index, baseIndex: index, bonus, state, dispatch }}>
      <UiContext.Provider value={ui}>
        <LiveSyncProvider>
          <div className={`window ${state.selected ? '' : 'no-inspector'}`}>
            <Sidebar />
            <main className="main view-in" key={viewKey}>
              {main}
            </main>
            {state.selected && (
              <aside className={`inspector ${state.inspectorOpen ? '' : 'closed'}`}>
                <Inspector item={state.selected} key={state.selected} />
              </aside>
            )}
          </div>
          {notesOpen && <ReleaseNotes onClose={() => setNotesOpen(false)} />}
          {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
          <EntityHover />
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
          <button className={`side-row ${v.kind === 'plan' ? 'active' : ''}`} onClick={() => dispatch({ type: 'view', view: { kind: 'plan' } })}>
            <img src={ui('CompletionLog')} alt="" />
            <span className="grow">{t('plan.title')}</span>
            {state.items.length > 0 && <span className="badge">{state.items.length}</span>}
          </button>
          <button className={`side-row ${v.kind === 'profile' ? 'active' : ''}`} onClick={() => dispatch({ type: 'view', view: { kind: 'profile' } })}>
            <img src={ui('Bank')} alt="" />
            <span className="grow">{t('profile.title')}</span>
            <LiveBadge />
          </button>
        </div>

        {state.items.length > 0 && (
          <div className="side-section">
            <div className="side-label">{t('nav.items')}</div>
            {state.items.map((g) => {
              const item = index.items.get(g.item)
              const active = v.kind === 'detail' && v.type === 'item' && v.id === g.item
              return (
                <button
                  key={g.item}
                  data-entity={`item:${g.item}`}
                  className={`side-row removable ${active ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: g.item } })}
                >
                  <GameIcon src={item?.icon} size={18} />
                  <span className="grow">{item?.name ?? g.item}</span>
                  <span className="badge">×{fmtInt(g.qty)}</span>
                  <span
                    className="side-remove"
                    role="button"
                    tabIndex={0}
                    aria-label={t('menu.removeFromPlan')}
                    title={t('menu.removeFromPlan')}
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'removeItem', item: g.item })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        dispatch({ type: 'removeItem', item: g.item })
                      }
                    }}
                  >
                    <Sym name="close" size={11} />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="side-section">
          <div className="side-label">
            {t('nav.routes')}
            <AddRouteMenu />
          </div>
          {state.routes.length === 0 && <div className="side-empty">{t('nav.routesEmpty')}</div>}
          {state.routes.map((r) => (
            <button
              key={r.id}
              className={`side-row removable ${v.kind === 'route' && v.id === r.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: r.id } })}
            >
              <GameIcon src={routeIcon(index, r)} size={18} />
              <span className="grow">{routeLabel(index, r)}</span>
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
                className={`side-row ${v.kind === 'skill' && v.skill === s.id ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'view', view: { kind: 'skill', skill: s.id } })}
              >
                <GameIcon src={s.icon} size={18} />
                <span className="grow">{s.name}</span>
                <span className="badge">{state.profile.levels[s.id] ?? 1}</span>
              </button>
            ))}
        </div>
      </div>

      <SidebarFooter />
    </nav>
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

function AddRouteMenu() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const add = (route: RouteTarget) => {
    dispatch({ type: 'addRoute', route })
    setOpen(false)
  }
  const firstSkill = index.data.skills.find((s) => s.id === 'MelvorBase:Woodcutting') ?? index.data.skills[0]
  const firstUnlock = index.data.purchases.find((p) => !p.items.length && !p.demoLocked && !(state.profile.owned[p.id] > 0))

  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <button aria-label={t('nav.addRoute')} onClick={() => setOpen(!open)}>
        <Sym name="plus" size={13} />
      </button>
      {open && (
        <div className="popover" style={{ left: -8, right: 'auto', top: 22, width: 230 }}>
          <button
            className="pop-row"
            onClick={() =>
              add({ id: newId(), kind: 'level', skill: firstSkill.id, level: Math.min(state.profile.levelCap ?? 120, (state.profile.levels[firstSkill.id] ?? 1) + 10) })
            }
          >
            <GameIcon src={firstSkill.icon} size={20} />
            <span className="grow">{t('nav.addLevel')}</span>
          </button>
          <button className="pop-row" onClick={() => add({ id: newId(), kind: 'gold', amount: 10000 })}>
            <GameIcon src={index.currencies.get(GP)?.icon} size={20} />
            <span className="grow">{t('nav.addGold')}</span>
          </button>
          {firstUnlock && (
            <button className="pop-row" onClick={() => add({ id: newId(), kind: 'unlock', purchase: firstUnlock.id })}>
              <GameIcon src={firstUnlock.icon} size={20} />
              <span className="grow">{t('nav.addUnlock')}</span>
            </button>
          )}
        </div>
      )}
    </span>
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
