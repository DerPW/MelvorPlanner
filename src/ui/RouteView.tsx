// Eine Route: ein Ziel und der ganze Weg dorthin — Trainieren, Gold
// verdienen, Freischaltungen kaufen, Herstellen, in der Reihenfolge, in der es
// gemacht werden muss. Bei Item-Zielen zusätzlich Baum und Material.

import { useMemo, useState } from 'react'
import { MAX_LEVEL } from '../core/experience'
import type { GameIndex } from '../core/planner'
import { isGoal, nextBest, solve } from '../core/solve'
import { useT, type T } from '../i18n'
import { GameIcon, Ref, Segmented, Select, Stepper, Switch, Sym, Toolbar } from './components'
import { Materials, TreeTable } from './PlanTables'
import { routeEntity, routeIcon, routeLabel, routeTarget } from './routeText'
import { recipeAction, RouteOverview, SolutionFlow, SolutionSummary } from './SolutionView'
import { useGame, type PlanTab, type RouteTarget } from './state'

export function RouteView({ id }: { id: string }) {
  const { index, baseIndex, state, dispatch } = useGame()
  const t = useT()
  const route = state.routes.find((r) => r.id === id)!
  const target = useMemo(() => routeTarget(route), [route])
  // Der Löser rechnet Boni selbst — auch die, die unterwegs gekauft werden
  const avoid = useMemo(() => route.avoid ?? [], [route.avoid])
  const solution = useMemo(
    () => solve(baseIndex, target, state.profile, state.choices, state.options, avoid),
    [baseIndex, target, state.profile, state.choices, state.options, avoid],
  )
  const update = (r: RouteTarget) => dispatch({ type: 'updateRoute', route: r })
  /** Einen Weg meiden; der vorige Stand bleibt für „‹“ */
  const setAvoid = (next: string[]) => update({ ...route, avoid: next, avoidHistory: [...(route.avoidHistory ?? []), avoid] })
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
        <AlternativeBar route={route} onNext={setAvoid} onPrev={() => update({ ...route, avoid: route.avoidHistory?.at(-1) ?? [], avoidHistory: route.avoidHistory?.slice(0, -1) ?? [] })} />
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
          {tab === 'flow' && (
            <SolutionFlow
              solution={solution}
              scope={id}
              alternatives={{
                avoided: avoid,
                avoid: (k) => !avoid.includes(k) && setAvoid([...avoid, k]),
                allow: (k) => setAvoid(avoid.filter((x) => x !== k)),
              }}
            />
          )}
          {tab === 'tree' && plan?.kind === 'craft' && <TreeTable plan={plan.plan} levels={plan.at.levels} solution={solution} />}
          {tab === 'materials' && plan?.kind === 'craft' && <Materials plan={plan.plan} />}
        </div>
      </div>
    </>
  )
}

/** Name eines gemiedenen Wegs */
function avoidLabel(index: GameIndex, key: string, t: T): string {
  if (key.startsWith('purchase:')) return index.purchases.get(key.slice(9))?.name ?? key.slice(9)
  const r = index.recipes.get(key)
  return r ? recipeAction(t, r) : key
}

/** „Weg 2 ‹ ›“: der nächstbeste Weg meidet eine weitere Abzweigung, „‹“ geht
 *  zum vorigen zurück. Gemiedenes steht als Chip da und lässt sich einzeln
 *  wieder erlauben. */
function AlternativeBar({ route, onNext, onPrev }: { route: RouteTarget; onNext: (avoid: string[]) => void; onPrev: () => void }) {
  const { index, baseIndex, state, dispatch } = useGame()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [none, setNone] = useState(false)
  const avoid = route.avoid ?? []
  const n = (route.avoidHistory?.length ?? 0) + 1
  const next = () => {
    setBusy(true)
    setNone(false)
    // Ein paar ganze Rechnungen — erst zeichnen, dann rechnen
    setTimeout(() => {
      const r = nextBest(baseIndex, routeTarget(route), state.profile, state.choices, state.options, avoid)
      if (r) onNext(r.avoid)
      else setNone(true)
      setBusy(false)
    }, 30)
  }
  const allow = (k: string) =>
    dispatch({ type: 'updateRoute', route: { ...route, avoid: avoid.filter((x) => x !== k), avoidHistory: [...(route.avoidHistory ?? []), avoid] } })
  return (
    <div className="alt-bar">
      <div className="alt-nav">
        <button className="icon-btn" disabled={n <= 1 || busy} title={t('alt.prev')} aria-label={t('alt.prev')} onClick={onPrev}>
          <Sym name="chevron" size={12} className="flip" />
        </button>
        <span className="alt-n">{avoid.length ? t('alt.way', { n }) : t('alt.best')}</span>
        <button className="icon-btn" disabled={busy} title={t('alt.next')} aria-label={t('alt.next')} onClick={next}>
          <Sym name="chevron" size={12} />
        </button>
      </div>
      {busy && <span className="muted">{t('alt.searching')}</span>}
      {none && !busy && <span className="muted">{t('alt.none')}</span>}
      {avoid.map((k) => (
        <span key={k} className="chip avoided" data-entity={k.startsWith('purchase:') ? k : index.recipes.get(k)?.outputs[0] ? `item:${index.recipes.get(k)!.outputs[0].item}` : undefined}>
          <Sym name="avoid" size={11} /> {t('alt.without', { name: avoidLabel(index, k, t) })}
          <button className="chip-x" aria-label={t('alt.allow')} title={t('alt.allow')} onClick={() => allow(k)}>
            <Sym name="close" size={9} />
          </button>
        </span>
      ))}
      {!avoid.length && !busy && !none && <span className="muted alt-hint">{t('alt.hint')}</span>}
    </div>
  )
}
