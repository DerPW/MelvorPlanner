import { useEffect, useReducer, useRef, useState } from 'react'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import type { GameIndex } from '../core/planner'
import { GameIcon, Sym } from './components'
import { Inspector } from './Inspector'
import { PlanView } from './PlanView'
import { ProfileView } from './ProfileView'
import { RouteView } from './RouteView'
import { SkillView } from './SkillView'
import { GameContext, loadState, newId, reducer, saveState, useGame, type RouteTarget } from './state'

export function App({ index }: { index: GameIndex }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])

  const view = state.view
  let main
  if (view.kind === 'profile') main = <ProfileView />
  else if (view.kind === 'skill') main = <SkillView skill={view.skill} />
  else if (view.kind === 'route' && state.routes.some((r) => r.id === view.id)) main = <RouteView id={view.id} />
  else main = <PlanView />

  return (
    <GameContext.Provider value={{ index, state, dispatch }}>
      <div className={`window ${state.selected ? '' : 'no-inspector'}`}>
        <Sidebar />
        <main className="main">{main}</main>
        {state.selected && (
          <aside className={`inspector ${state.inspectorOpen ? '' : 'closed'}`}>
            <Inspector item={state.selected} />
          </aside>
        )}
      </div>
    </GameContext.Provider>
  )
}

export function routeLabel(index: GameIndex, r: RouteTarget): string {
  if (r.kind === 'level') return `${index.skills.get(r.skill)?.name ?? r.skill} → ${r.level}`
  if (r.kind === 'gold') return `${fmtInt(r.amount)} GP`
  return index.purchases.get(r.purchase)?.name ?? r.purchase
}

export function routeIcon(index: GameIndex, r: RouteTarget): string | null {
  if (r.kind === 'level') return index.skills.get(r.skill)?.icon ?? null
  if (r.kind === 'gold') return index.currencies.get(GP)?.icon ?? null
  return index.purchases.get(r.purchase)?.icon ?? null
}

function Sidebar() {
  const { index, state, dispatch } = useGame()
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

      <div className="sidebar-scroll">
        <div className="side-section" style={{ marginTop: 4 }}>
          <button className={`side-row ${v.kind === 'plan' ? 'active' : ''}`} onClick={() => dispatch({ type: 'view', view: { kind: 'plan' } })}>
            <img src={ui('CompletionLog')} alt="" />
            <span className="grow">Crafting-Plan</span>
            {state.items.length > 0 && <span className="badge">{state.items.length}</span>}
          </button>
          <button className={`side-row ${v.kind === 'profile' ? 'active' : ''}`} onClick={() => dispatch({ type: 'view', view: { kind: 'profile' } })}>
            <img src={ui('Bank')} alt="" />
            <span className="grow">Profil</span>
          </button>
        </div>

        {state.items.length > 0 && (
          <div className="side-section">
            <div className="side-label">Items</div>
            {state.items.map((g) => {
              const item = index.items.get(g.item)
              return (
                <button
                  key={g.item}
                  className={`side-row ${state.selected === g.item && v.kind === 'plan' ? 'active' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'view', view: { kind: 'plan' } })
                    dispatch({ type: 'select', item: g.item })
                  }}
                >
                  <GameIcon src={item?.icon} size={18} />
                  <span className="grow">{item?.name ?? g.item}</span>
                  <span className="badge">×{fmtInt(g.qty)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="side-section">
          <div className="side-label">
            Routen
            <AddRouteMenu />
          </div>
          {state.routes.length === 0 && <div className="side-empty">Level, Gold oder Freischaltung</div>}
          {state.routes.map((r) => (
            <button
              key={r.id}
              className={`side-row ${v.kind === 'route' && v.id === r.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: r.id } })}
            >
              <GameIcon src={routeIcon(index, r)} size={18} />
              <span className="grow">{routeLabel(index, r)}</span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <div className="side-label">Skills</div>
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
    </nav>
  )
}

function AddRouteMenu() {
  const { index, state, dispatch } = useGame()
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
      <button aria-label="Route hinzufügen" onClick={() => setOpen(!open)}>
        <Sym name="plus" size={13} />
      </button>
      {open && (
        <div className="popover" style={{ left: -8, right: 'auto', top: 22, width: 230 }}>
          <button
            className="pop-row"
            onClick={() =>
              add({ id: newId(), kind: 'level', skill: firstSkill.id, level: Math.min(120, (state.profile.levels[firstSkill.id] ?? 1) + 10) })
            }
          >
            <GameIcon src={firstSkill.icon} size={20} />
            <span className="grow">Level erreichen</span>
          </button>
          <button className="pop-row" onClick={() => add({ id: newId(), kind: 'gold', amount: 10000 })}>
            <GameIcon src={index.currencies.get(GP)?.icon} size={20} />
            <span className="grow">Gold verdienen</span>
          </button>
          {firstUnlock && (
            <button className="pop-row" onClick={() => add({ id: newId(), kind: 'unlock', purchase: firstUnlock.id })}>
              <GameIcon src={firstUnlock.icon} size={20} />
              <span className="grow">Freischaltung kaufen</span>
            </button>
          )}
        </div>
      )}
    </span>
  )
}
