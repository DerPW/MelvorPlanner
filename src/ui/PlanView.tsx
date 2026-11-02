import { useMemo, useState } from 'react'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { isAvailable, type Plan, type PlanNode } from '../core/planner'
import { GP } from '../core/route'
import { isGoal, solve, type Solution } from '../core/solve'
import type { Id } from '../core/types'
import { useT } from '../i18n'
import { GameIcon, LevelTag, Segmented, Sym, Toolbar } from './components'
import { recipeAction, RouteOverview, SolutionFlow, SolutionSummary, unlockStep } from './SolutionView'
import { useGame, type PlanTab } from './state'
import { focusSearch } from './ui'

export function PlanView() {
  const { baseIndex, state, dispatch } = useGame()
  const t = useT()
  // Der Löser rechnet Boni selbst — auch die, die unterwegs gekauft werden
  const solution = useMemo(
    () => solve(baseIndex, { kind: 'items', items: state.items }, state.profile, state.choices, state.options),
    [baseIndex, state.items, state.profile, state.choices, state.options],
  )
  // Baum und Material zeigen den Plan für die Ziele selbst (nach allem Training)
  const plan = [...solution.phases].reverse().find((p) => p.kind === 'craft' && isGoal(p.why))

  return (
    <>
      <Toolbar
        title={t('plan.title')}
        subtitle={
          state.items.length
            ? `${t('plan.goals', { n: state.items.length })} · ${t(state.options.bonuses ? 'common.withBonuses' : 'common.baseValues')}`
            : baseIndex.data.meta.packages.join(', ')
        }
      >
        {state.items.length > 0 && (
          <Segmented<PlanTab>
            value={state.tab}
            onChange={(tab) => dispatch({ type: 'tab', tab })}
            options={[
              { value: 'flow', label: t('plan.tab.flow'), icon: 'list' },
              { value: 'tree', label: t('plan.tab.tree'), icon: 'tree' },
              { value: 'materials', label: t('plan.tab.materials'), icon: 'box' },
            ]}
          />
        )}
        <button className="btn" onClick={focusSearch}>
          <Sym name="plus" size={13} /> {t('plan.add')}
          <kbd className="kbd">⌘K</kbd>
        </button>
      </Toolbar>
      <div className="content">
        {state.items.length === 0 ? (
          <EmptyPlan />
        ) : (
          <>
            <SolutionSummary solution={solution} />
            <RouteOverview solution={solution} onOpen={() => dispatch({ type: 'tab', tab: 'flow' })} />
            <div className="fade-in" key={state.tab}>
              {state.tab === 'flow' && <SolutionFlow solution={solution} scope="plan" />}
              {state.tab === 'tree' && plan?.kind === 'craft' && <TreeTable plan={plan.plan} levels={plan.at.levels} solution={solution} />}
              {state.tab === 'materials' && plan?.kind === 'craft' && <Materials plan={plan.plan} />}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function EmptyPlan() {
  const { index, state, dispatch } = useGame()
  const t = useT()
  // Ein paar Dinge, die man mit dem jetzigen Stand gleich bauen kann
  const suggestions = useMemo(() => {
    const seen = new Set<Id>()
    return index.data.recipes
      .filter((r) => (r.kind === 'artisan' || r.kind === 'cooking') && isAvailable(r, state.profile) && r.inputs.length >= 2)
      .map((r) => r.outputs[0]?.item)
      .filter((id): id is Id => !!id && !seen.has(id) && !!seen.add(id))
      .slice(0, 6)
  }, [index, state.profile])

  return (
    <div className="empty">
      <div className="art">
        {suggestions.slice(0, 3).map((id) => (
          <GameIcon key={id} src={index.items.get(id)?.icon} size={40} />
        ))}
      </div>
      <h2>{t('plan.empty.title')}</h2>
      <p>{t('plan.empty.text')}</p>
      <div className="suggest">
        {suggestions.map((id) => (
          <button key={id} className="note" data-entity={`item:${id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id } })}>
            <GameIcon src={index.items.get(id)?.icon} size={16} />
            {index.items.get(id)?.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function TreeTable({ plan, levels, solution }: { plan: Plan; levels: Record<Id, number>; solution: Solution }) {
  const t = useT()
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  const rows: PlanNode[] = []
  const walk = (n: PlanNode) => {
    rows.push(n)
    if (!closed.has(n.key)) n.children.forEach(walk)
  }
  plan.roots.forEach(walk)

  return (
    <table className="table tree">
      <colgroup>
        <col />
        <col style={{ width: 84 }} />
        <col className="hide-narrow" style={{ width: 84 }} />
        <col style={{ width: '34%' }} />
        <col style={{ width: 84 }} />
      </colgroup>
      <thead>
        <tr>
          <th>{t('tree.item')}</th>
          <th className="num">{t('tree.need')}</th>
          <th className="num hide-narrow">{t('tree.have')}</th>
          <th>{t('tree.source')}</th>
          <th className="num">{t('tree.time')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <TreeRow
            key={n.key}
            node={n}
            levels={levels}
            step={n.recipe ? unlockStep(solution, n.recipe) : null}
            open={!closed.has(n.key)}
            onToggle={() => toggle(n.key)}
          />
        ))}
      </tbody>
    </table>
  )
}

function TreeRow({
  node,
  levels,
  step,
  open,
  onToggle,
}: {
  node: PlanNode
  levels: Record<Id, number>
  /** Schritt im Ablauf, nach dem diese Quelle frei ist */
  step: number | null
  open: boolean
  onToggle: () => void
}) {
  const { index, state, dispatch } = useGame()
  const t = useT()
  const item = index.items.get(node.item)
  const r = node.recipe
  const skill = r?.skill ? index.skills.get(r.skill) : null
  const selected = state.selected === node.item
  return (
    <tr
      data-entity={`item:${node.item}`}
      className={`${selected ? 'selected' : ''} ${node.toMake === 0 ? 'dim' : ''}`}
      onClick={() => dispatch({ type: 'select', item: node.item })}
      onDoubleClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: node.item } })}
    >
      <td>
        <div className="cell-item">
          <span className="indent" style={{ width: node.depth * 18 }} />
          {node.children.length ? (
            <button
              className={`disclosure ${open ? 'open' : ''}`}
              aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
            >
              <Sym name="chevron" size={11} />
            </button>
          ) : (
            <span className="disclosure-spacer" />
          )}
          <GameIcon src={item?.icon} size={20} />
          <span className="name">{item?.name ?? node.item}</span>
          {node.issue === 'noSource' && <span className="tag warn">{t('tree.noSource')}</span>}
          {node.issue === 'locked' && <span className="tag locked">Demo</span>}
          {node.issue === 'cycle' && <span className="tag warn">{t('tree.cycle')}</span>}
          {node.surplus > 0 && (
            <span className="muted" title={t('tree.surplus')}>
              +{fmtInt(node.surplus)}
            </span>
          )}
        </div>
      </td>
      <td className="num">{fmtNum(node.need)}</td>
      <td className="num hide-narrow">{node.fromStock > 0 ? <span className="ok">{fmtInt(node.fromStock)}</span> : <span className="muted">—</span>}</td>
      <td>
        {r ? (
          <div className="cell-source">
            <GameIcon src={skill?.icon ?? r.icon} size={16} />
            <span className="name">
              {recipeAction(t, r)}
              {node.completions !== node.toMake && node.completions > 0 && <span className="muted"> · {fmtInt(node.completions)}×</span>}
            </span>
            <LevelTag level={r.level} have={r.skill ? (levels[r.skill] ?? 1) : 1} />
            {step && (
              <span className="tag unlock-step" title={t('tree.afterStepHint')}>
                {t('tree.afterStep', { n: step })}
              </span>
            )}
            {node.alternatives > 1 && (
              <span className="muted" title={t('tree.alternatives')}>
                +{node.alternatives - 1}
              </span>
            )}
          </div>
        ) : node.toMake === 0 ? (
          <span className="ok" title={t('tree.haveHint')}>
            {t('tree.available')}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="num">{node.timeMs > 0 ? fmtDurationShort(node.timeMs) : <span className="muted">—</span>}</td>
    </tr>
  )
}

function Materials({ plan }: { plan: Plan }) {
  const { index, dispatch, state } = useGame()
  const t = useT()
  const groups: { id: string; map: Map<Id, number> }[] = [
    { id: 'gather', map: plan.gathered },
    { id: 'buy', map: plan.bought },
    { id: 'have', map: plan.stockUsed },
    { id: 'missing', map: plan.missing },
  ]
  const shopCost = plan.spent.get(GP) ?? 0
  return (
    <>
      {groups
        .filter((g) => g.map.size > 0)
        .map((g) => (
          <section key={g.id}>
            <div className="group-title">
              {t(`mat.${g.id}`)} <span className="muted">{t(`mat.${g.id}.hint`)}</span>
            </div>
            <table className="table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col className="hide-narrow" style={{ width: 130 }} />
              </colgroup>
              <tbody>
                {[...g.map]
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, n]) => {
                    const item = index.items.get(id)
                    const sells = item?.sells
                    return (
                      <tr
                        key={id}
                        data-entity={`item:${id}`}
                        className={state.selected === id ? 'selected' : ''}
                        onClick={() => dispatch({ type: 'select', item: id })}
                        onDoubleClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id } })}
                      >
                        <td>
                          <div className="cell-item">
                            <GameIcon src={item?.icon} size={20} />
                            <span className="name">{item?.name ?? id}</span>
                          </div>
                        </td>
                        <td className="num">{fmtInt(n)}×</td>
                        <td className="num hide-narrow muted">{sells ? t('mat.value', { gp: fmtInt(sells.qty * n) }) : ''}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </section>
        ))}
      {shopCost > 0 && (
        <p className="muted" style={{ margin: '14px 4px' }}>
          {t('mat.shopCost')} <span className="gold">{fmtInt(shopCost)} GP</span>
        </p>
      )}
    </>
  )
}
