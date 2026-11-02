import { useMemo } from 'react'
import { MAX_LEVEL } from '../core/experience'
import { solve, type Target } from '../core/solve'
import { Select, Stepper, Switch, Sym, Toolbar } from './components'
import { routeLabel } from './App'
import { SolutionFlow, SolutionSummary } from './SolutionView'
import { useGame, type RouteTarget } from './state'

export function RouteView({ id }: { id: string }) {
  const { index, state, dispatch } = useGame()
  const route = state.routes.find((r) => r.id === id)!
  const target: Target = useMemo(() => {
    const { id: _id, ...t } = route
    return t
  }, [route])
  const solution = useMemo(
    () => solve(index, target, state.profile, state.choices, state.options),
    [index, target, state.profile, state.choices, state.options],
  )
  const update = (r: RouteTarget) => dispatch({ type: 'updateRoute', route: r })

  const kind = route.kind === 'level' ? 'Level-Route' : route.kind === 'gold' ? 'Gold-Route' : 'Freischaltung'
  const trainable = index.data.skills.filter((s) => index.data.recipes.some((r) => r.skill === s.id && r.xp > 0))
  const unlocks = index.data.purchases
    .filter((p) => !p.items.length)
    .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name))

  return (
    <>
      <Toolbar title={routeLabel(index, route)} subtitle={`${kind} · schnellster Weg mit Grundwerten`}>
        <div className="toolbar-controls">
          {route.kind === 'level' && (
            <>
              <Select label="Skill" value={route.skill} onChange={(skill) => update({ ...route, skill })}>
                {trainable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <span className="lbl">auf</span>
              <Stepper narrow label="Ziel-Level" value={route.level} min={2} max={MAX_LEVEL} onChange={(level) => update({ ...route, level })} />
            </>
          )}
          {route.kind === 'gold' && (
            <Stepper label="Gold" value={route.amount} min={1} step={1000} onChange={(amount) => update({ ...route, amount })} />
          )}
          {route.kind === 'unlock' && (
            <Select label="Freischaltung" value={route.purchase} onChange={(purchase) => update({ ...route, purchase })}>
              {[...Map.groupBy(unlocks, (p) => p.category ?? 'Sonstiges')].map(([category, list]) => (
                <optgroup key={category} label={category}>
                  {list.map((p) => {
                    const lv = p.reqs.find((q) => q.type === 'level')
                    return (
                      <option key={p.id} value={p.id} disabled={p.demoLocked}>
                        {p.name}
                        {lv?.type === 'level' ? ` — ${index.skills.get(lv.skill)?.name} ${lv.level}` : ''}
                        {p.demoLocked ? ' (Demo)' : ''}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </Select>
          )}
          <button className="icon-btn" title="Route entfernen" aria-label="Route entfernen" onClick={() => dispatch({ type: 'removeRoute', id })}>
            <Sym name="close" size={14} />
          </button>
        </div>
      </Toolbar>
      <div className="content">
        <SolutionSummary solution={solution} />
        <div className="inline-option">
          <Switch
            label="Material selbst beschaffen"
            checked={state.options.includeMaterials}
            onChange={(includeMaterials) => dispatch({ type: 'setOption', options: { includeMaterials } })}
          />
          <span>
            Material selbst beschaffen
            <span className="muted"> — aus: tut so, als läge alles im Lager (reine Aktionszeit)</span>
          </span>
        </div>
        <SolutionFlow solution={solution} scope={id} />
      </div>
    </>
  )
}
