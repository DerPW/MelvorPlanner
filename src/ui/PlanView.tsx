import { useMemo, useState } from 'react'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { isAvailable, type Plan, type PlanNode } from '../core/planner'
import { GP } from '../core/route'
import { solve } from '../core/solve'
import type { Id } from '../core/types'
import { GameIcon, LevelTag, Segmented, Sym, Toolbar } from './components'
import { ItemSearch } from './ItemSearch'
import { recipeAction, SolutionFlow, SolutionSummary } from './SolutionView'
import { useGame, type PlanTab } from './state'

export function PlanView() {
  const { index, state, dispatch } = useGame()
  const solution = useMemo(
    () => solve(index, { kind: 'items', items: state.items }, state.profile, state.choices, state.options),
    [index, state.items, state.profile, state.choices, state.options],
  )
  // Baum und Material zeigen den Plan für die Ziele selbst (nach allem Training)
  const plan = [...solution.phases].reverse().find((p) => p.kind === 'craft' && p.why === 'Ziel')
  const meta = index.data.meta

  return (
    <>
      <Toolbar
        title="Crafting-Plan"
        subtitle={state.items.length ? `${state.items.length} Ziel${state.items.length > 1 ? 'e' : ''} · Grundwerte ohne Boni` : `${meta.packages.join(', ')}`}
      >
        {state.items.length > 0 && (
          <Segmented<PlanTab>
            value={state.tab}
            onChange={(tab) => dispatch({ type: 'tab', tab })}
            options={[
              { value: 'flow', label: 'Ablauf', icon: 'list' },
              { value: 'tree', label: 'Baum', icon: 'tree' },
              { value: 'materials', label: 'Material', icon: 'box' },
            ]}
          />
        )}
        <ItemSearch shortcut placeholder="Item hinzufügen" onPick={(item) => dispatch({ type: 'addItem', item })} />
      </Toolbar>
      <div className="content">
        {state.items.length === 0 ? (
          <EmptyPlan />
        ) : (
          <>
            <SolutionSummary solution={solution} />
            {state.tab === 'flow' && <SolutionFlow solution={solution} scope="plan" />}
            {state.tab === 'tree' && plan?.kind === 'craft' && <TreeTable plan={plan.plan} levels={plan.at.levels} />}
            {state.tab === 'materials' && plan?.kind === 'craft' && <Materials plan={plan.plan} />}
          </>
        )}
      </div>
    </>
  )
}

function EmptyPlan() {
  const { index, state, dispatch } = useGame()
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
      <h2>Was willst du bauen?</h2>
      <p>Such oben ein Item (⌘K). Der Plan rechnet alles bis zum Rohstoff herunter — mit Training, Gold und Freischaltungen, die dafür nötig sind.</p>
      <div className="suggest">
        {suggestions.map((id) => (
          <button key={id} className="note" onClick={() => dispatch({ type: 'addItem', item: id })}>
            <GameIcon src={index.items.get(id)?.icon} size={16} />
            {index.items.get(id)?.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function TreeTable({ plan, levels }: { plan: Plan; levels: Record<Id, number> }) {
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
        <col className="hide-narrow" style={{ width: 72 }} />
        <col style={{ width: '34%' }} />
        <col style={{ width: 84 }} />
      </colgroup>
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Bedarf</th>
          <th className="num hide-narrow">Vorhanden</th>
          <th>Quelle</th>
          <th className="num">Zeit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <TreeRow key={n.key} node={n} levels={levels} open={!closed.has(n.key)} onToggle={() => toggle(n.key)} />
        ))}
      </tbody>
    </table>
  )
}

function TreeRow({ node, levels, open, onToggle }: { node: PlanNode; levels: Record<Id, number>; open: boolean; onToggle: () => void }) {
  const { index, state, dispatch } = useGame()
  const item = index.items.get(node.item)
  const r = node.recipe
  const skill = r?.skill ? index.skills.get(r.skill) : null
  const selected = state.selected === node.item
  return (
    <tr className={`${selected ? 'selected' : ''} ${node.toMake === 0 ? 'dim' : ''}`} onClick={() => dispatch({ type: 'select', item: node.item })}>
      <td>
        <div className="cell-item">
          <span className="indent" style={{ width: node.depth * 18 }} />
          {node.children.length ? (
            <button
              className={`disclosure ${open ? 'open' : ''}`}
              aria-label={open ? 'Zuklappen' : 'Aufklappen'}
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
          {node.issue === 'noSource' && <span className="tag warn">keine Quelle</span>}
          {node.issue === 'locked' && <span className="tag locked">Demo</span>}
          {node.issue === 'cycle' && <span className="tag warn">Kreis</span>}
          {node.surplus > 0 && <span className="muted" title="Überschuss geht ins Lager">+{fmtInt(node.surplus)}</span>}
        </div>
      </td>
      <td className="num">{fmtNum(node.need)}</td>
      <td className="num hide-narrow">{node.fromStock > 0 ? <span className="ok">{fmtInt(node.fromStock)}</span> : <span className="muted">—</span>}</td>
      <td>
        {r ? (
          <div className="cell-source">
            <GameIcon src={skill?.icon ?? r.icon} size={16} />
            <span className="name">
              {recipeAction(r)}
              {node.completions !== node.toMake && node.completions > 0 && <span className="muted"> · {fmtInt(node.completions)}×</span>}
            </span>
            <LevelTag level={r.level} have={r.skill ? (levels[r.skill] ?? 1) : 1} />
            {node.alternatives > 1 && <span className="muted" title="Andere Quellen im Inspector">+{node.alternatives - 1}</span>}
          </div>
        ) : node.toMake === 0 ? (
          <span className="ok" title="Aus dem Lager oder beim Training angefallen">vorhanden</span>
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
  const groups: { title: string; hint: string; map: Map<Id, number> }[] = [
    { title: 'Sammeln', hint: 'Rohstoffe aus Holzfällen, Bergbau, Angeln, Farming, Thieving', map: plan.gathered },
    { title: 'Kaufen', hint: 'aus dem Shop', map: plan.bought },
    { title: 'Vorhanden', hint: 'aus dem Lager oder beim Training angefallen', map: plan.stockUsed },
    { title: 'Ohne Quelle', hint: 'Monster-Drops, Hunting, Ranching … rechnet der Planer noch nicht', map: plan.missing },
  ]
  const shopCost = plan.spent.get(GP) ?? 0
  return (
    <>
      {groups
        .filter((g) => g.map.size > 0)
        .map((g) => (
          <section key={g.title}>
            <div className="group-title">
              {g.title} <span className="muted">{g.hint}</span>
            </div>
            <table className="table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col className="hide-narrow" style={{ width: 120 }} />
              </colgroup>
              <tbody>
                {[...g.map]
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, n]) => {
                    const item = index.items.get(id)
                    const sells = item?.sells
                    return (
                      <tr key={id} className={state.selected === id ? 'selected' : ''} onClick={() => dispatch({ type: 'select', item: id })}>
                        <td>
                          <div className="cell-item">
                            <GameIcon src={item?.icon} size={20} />
                            <span className="name">{item?.name ?? id}</span>
                          </div>
                        </td>
                        <td className="num">{fmtInt(n)}×</td>
                        <td className="num hide-narrow muted">{sells ? `${fmtInt(sells.qty * n)} GP Wert` : ''}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </section>
        ))}
      {shopCost > 0 && (
        <p className="muted" style={{ margin: '14px 4px' }}>
          Shop-Kosten zusammen: <span className="gold">{fmtInt(shopCost)} GP</span>
        </p>
      )}
    </>
  )
}
