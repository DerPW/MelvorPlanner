// Eine Route: ein Ziel und der ganze Weg dorthin — Trainieren, Gold
// verdienen, Freischaltungen kaufen, Herstellen, in der Reihenfolge, in der es
// gemacht werden muss. Bei Item-Zielen zusätzlich Baum und Material.

import { useMemo } from 'react'
import { MAX_LEVEL } from '../core/experience'
import { isGoal, solve } from '../core/solve'
import { useT } from '../i18n'
import { GameIcon, Ref, Segmented, Select, Stepper, Switch, Sym, Toolbar } from './components'
import { Materials, TreeTable } from './PlanTables'
import { routeEntity, routeIcon, routeLabel, routeTarget } from './routeText'
import { RouteOverview, SolutionFlow, SolutionSummary } from './SolutionView'
import { useGame, type PlanTab, type RouteTarget } from './state'

export function RouteView({ id }: { id: string }) {
  const { index, baseIndex, state, dispatch } = useGame()
  const t = useT()
  const route = state.routes.find((r) => r.id === id)!
  const target = useMemo(() => routeTarget(route), [route])
  // Der Löser rechnet Boni selbst — auch die, die unterwegs gekauft werden
  const solution = useMemo(
    () => solve(baseIndex, target, state.profile, state.choices, state.options),
    [baseIndex, target, state.profile, state.choices, state.options],
  )
  const update = (r: RouteTarget) => dispatch({ type: 'updateRoute', route: r })
  // Baum und Material zeigen den Plan für das Ziel selbst (nach allem Training)
  const plan = route.kind === 'item' ? [...solution.phases].reverse().find((p) => p.kind === 'craft' && isGoal(p.why)) : undefined
  const tab = plan ? state.tab : 'flow'

  const trainable = index.data.skills.filter((s) => index.data.recipes.some((r) => r.skill === s.id && r.xp > 0))
  const unlocks = index.data.purchases
    .filter((p) => !p.items.length)
    .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name))
  const entity = routeEntity(route)

  return (
    <>
      <Toolbar
        title={
          <span className="route-title">
            <GameIcon src={routeIcon(index, route)} size={20} entity={entity} />
            {entity ? <Ref entity={entity}>{routeLabel(index, route)}</Ref> : routeLabel(index, route)}
          </span>
        }
        subtitle={`${t(`route.kind.${route.kind}`)} · ${t(state.options.smart ? 'route.subtitleSmart' : 'route.subtitle')}`}
      >
        {plan && (
          <Segmented<PlanTab>
            value={tab}
            onChange={(tab) => dispatch({ type: 'tab', tab })}
            options={[
              { value: 'flow', label: t('plan.tab.flow'), icon: 'list' },
              { value: 'tree', label: t('plan.tab.tree'), icon: 'tree' },
              { value: 'materials', label: t('plan.tab.materials'), icon: 'box' },
            ]}
          />
        )}
        <div className="toolbar-controls">
          {route.kind === 'item' && (
            <Stepper label={t('route.qty')} value={route.qty} min={1} onChange={(qty) => update({ ...route, qty })} />
          )}
          {route.kind === 'level' && (
            <>
              <Select label={t('route.skill')} value={route.skill} onChange={(skill) => update({ ...route, skill })}>
                {trainable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <span className="lbl">{t('route.to')}</span>
              <Stepper
                narrow
                label={t('route.targetLevel')}
                value={route.level}
                min={2}
                max={state.profile.levelCap ?? MAX_LEVEL}
                onChange={(level) => update({ ...route, level })}
              />
            </>
          )}
          {route.kind === 'gold' && (
            <Stepper label={t('sum.gold')} value={route.amount} min={1} step={1000} onChange={(amount) => update({ ...route, amount })} />
          )}
          {route.kind === 'unlock' && (
            <Select label={t('route.kind.unlock')} value={route.purchase} onChange={(purchase) => update({ ...route, purchase })}>
              {[...Map.groupBy(unlocks, (p) => p.category ?? t('route.other'))].map(([category, list]) => (
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
          <button className="icon-btn" title={t('route.remove')} aria-label={t('route.remove')} onClick={() => dispatch({ type: 'removeRoute', id })}>
            <Sym name="close" size={14} />
          </button>
        </div>
      </Toolbar>
      <div className="content">
        <SolutionSummary solution={solution} />
        <RouteOverview solution={solution} onOpen={plan ? () => dispatch({ type: 'tab', tab: 'flow' }) : undefined} />
        {tab === 'flow' && (
          <div className="inline-option">
            <Switch
              label={t('opt.materials')}
              checked={state.options.includeMaterials}
              onChange={(includeMaterials) => dispatch({ type: 'setOption', options: { includeMaterials } })}
            />
            <span>
              {t('opt.materials')}
              <span className="muted"> — {t('opt.materials.off')}</span>
            </span>
          </div>
        )}
        <div className="fade-in" key={tab}>
          {tab === 'flow' && <SolutionFlow solution={solution} scope={id} />}
          {tab === 'tree' && plan?.kind === 'craft' && <TreeTable plan={plan.plan} levels={plan.at.levels} solution={solution} />}
          {tab === 'materials' && plan?.kind === 'craft' && <Materials plan={plan.plan} />}
        </div>
      </div>
    </>
  )
}
