// Baum und Material einer Item-Route: der Plan für die Ziele selbst,
// gerechnet mit dem Stand nach allem Training davor.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { fmtCompact, fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { rankSources, type Plan, type PlanNode } from '../core/planner'
import { GP } from '../core/route'
import type { Solution } from '../core/solve'
import type { Id, Recipe } from '../core/types'
import { useT } from '../i18n'
import { GameIcon, LevelTag, Sym } from './components'
import { Cost, recipeAction, SourceText, unlockStep } from './SolutionView'
import { useGame } from './state'

/** Woher ein Item kommt — die Plakette rechts in jeder Zeile */
type Mode = 'make' | 'gather' | 'loot' | 'fight' | 'buy' | 'stock' | 'missing'

const modeOf = (r: Recipe): Mode =>
  r.kind === 'shop'
    ? 'buy'
    : r.kind === 'combat'
      ? 'fight'
      : r.kind === 'thieving' || r.kind === 'open'
        ? 'loot'
        : r.kind === 'woodcutting' || r.kind === 'mining' || r.kind === 'fishing' || r.kind === 'farming'
          ? 'gather'
          : 'make'

const nodeMode = (n: PlanNode): Mode => (n.recipe && n.issue !== 'noSource' ? modeOf(n.recipe) : n.toMake <= 0 ? 'stock' : 'missing')

/** Zeit des Knotens samt allem darunter */
const totalMs = (n: PlanNode): number => n.timeMs + n.children.reduce((s, c) => s + totalMs(c), 0)

/**
 * Herstellbaum wie ein Outline: Linien zeigen, was wofür gebraucht wird, jede
 * Zeile sagt Menge, Lager, Quelle und Zeit; die Plakette rechts wechselt die
 * Quelle, die Auswahl öffnet den Inspector.
 */
export function CraftTree({ plan, levels, solution }: { plan: Plan; levels: Record<Id, number>; solution: Solution }) {
  const { state, dispatch } = useGame()
  const t = useT()
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (key: string, open?: boolean) =>
    setClosed((s) => {
      const n = new Set(s)
      if (open ?? n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  const all: PlanNode[] = []
  const collect = (n: PlanNode) => {
    all.push(n)
    n.children.forEach(collect)
  }
  plan.roots.forEach(collect)
  // Selbst gewählte Quellen in diesem Baum
  const forced = [...new Set(all.map((n) => n.item))].filter((id) => state.choices[id])
  const roots = new Set(plan.roots.map((n) => n.key))

  return (
    <div className="ctree-wrap">
      <div className="ct-bar">
        <span className="muted">{t('ct.meta', { n: fmtInt(all.length) })}</span>
        {forced.length > 0 && (
          <button className="btn plain small" onClick={() => forced.forEach((item) => dispatch({ type: 'choose', item, recipe: null }))}>
            <Sym name="reset" size={12} /> {t('ct.resetChoices', { n: forced.length })}
          </button>
        )}
        <button className="btn plain small" onClick={() => setClosed(new Set())}>
          {t('ct.expandAll')}
        </button>
        <button className="btn plain small" onClick={() => setClosed(new Set(all.filter((n) => n.children.length && !roots.has(n.key)).map((n) => n.key)))}>
          {t('ct.collapseAll')}
        </button>
      </div>
      <ul className="ctree" role="tree">
        {plan.roots.map((n) => (
          <Branch key={n.key} node={n} levels={levels} solution={solution} closed={closed} onToggle={toggle} />
        ))}
      </ul>
    </div>
  )
}

function Branch({
  node,
  levels,
  solution,
  closed,
  onToggle,
}: {
  node: PlanNode
  levels: Record<Id, number>
  solution: Solution
  closed: Set<string>
  onToggle: (key: string, open?: boolean) => void
}) {
  const { state } = useGame()
  const open = node.children.length > 0 && !closed.has(node.key)
  return (
    <li
      className={node.depth > 0 ? 'ct-child' : undefined}
      role="treeitem"
      aria-expanded={node.children.length ? open : undefined}
      aria-selected={state.selected === node.item}
    >
      <Row node={node} levels={levels} solution={solution} open={open} onToggle={(o) => onToggle(node.key, o)} />
      {open && (
        <ul role="group">
          {node.children.map((c) => (
            <Branch key={c.key} node={c} levels={levels} solution={solution} closed={closed} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Row({
  node,
  levels,
  solution,
  open,
  onToggle,
}: {
  node: PlanNode
  levels: Record<Id, number>
  solution: Solution
  open: boolean
  onToggle: (open?: boolean) => void
}) {
  const { index, state, dispatch } = useGame()
  const t = useT()
  const item = index.items.get(node.item)
  const r = node.recipe
  const skill = r?.skill ? index.skills.get(r.skill) : null
  const mode = nodeMode(node)
  // Schritt im Ablauf, nach dem diese Quelle frei ist
  const step = r ? unlockStep(solution, r) : null
  const sum = totalMs(node)
  const costs = r && node.completions > 0 ? r.costs : []
  const select = () => dispatch({ type: 'select', item: node.item })
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') select()
    else if (e.key === 'ArrowRight' && node.children.length && !open) onToggle(true)
    else if (e.key === 'ArrowLeft' && open) onToggle(false)
    else return
    e.preventDefault()
  }
  return (
    <div
      className={`ct-row ${state.selected === node.item ? 'selected' : ''}`}
      data-entity={`item:${node.item}`}
      tabIndex={0}
      onClick={select}
      onKeyDown={key}
      onDoubleClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: node.item } })}
    >
      {node.children.length ? (
        <button
          className={`disclosure ${open ? 'open' : ''}`}
          tabIndex={-1}
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
      <span className="ct-icon">
        <GameIcon src={item?.icon} size={28} entity={`item:${node.item}`} />
        <span className="ct-qty">{fmtCompact(node.need)}</span>
      </span>
      <span className="ct-main">
        <span className="ct-name">
          <span className="name">{item?.name ?? node.item}</span>
          {node.issue === 'locked' && <span className="tag locked">Demo</span>}
          {node.issue === 'cycle' && <span className="tag warn">{t('tree.cycle')}</span>}
          {r && <LevelTag level={r.level} have={r.skill ? (levels[r.skill] ?? 1) : 1} />}
          {step && (
            <span className="tag unlock-step" title={t('tree.afterStepHint')}>
              {t('tree.afterStep', { n: step })}
            </span>
          )}
        </span>
        <span className="ct-sub">
          <span>{t('ct.need', { n: fmtNum(node.need) })}</span>
          {node.fromStock > 0 && <span className="ok">{t('ct.fromStock', { n: fmtInt(node.fromStock) })}</span>}
          {node.surplus > 0 && (
            <span className="gold" title={t('tree.surplus')}>
              {t('ct.surplus', { n: fmtInt(node.surplus) })}
            </span>
          )}
          {r && node.completions > 0 && (
            <span className="ct-src">
              {skill && <GameIcon src={skill.icon} size={13} />}
              {/* Heißt das Rezept wie das Item, reicht der Skill — sonst Monster, Kauf, Beute */}
              {r.name === item?.name && skill ? skill.name : <SourceText r={r} self={node.item} />}
              {/* Durchläufe nur, wenn einer nicht genau eins ergibt */}
              {node.completions !== node.toMake && <span>{t('ct.runs', { n: fmtInt(node.completions) })}</span>}
            </span>
          )}
          {mode === 'missing' && <span className="bad">{t('tree.noSource')}</span>}
        </span>
      </span>
      <ModeBadge node={node} mode={mode} />
      <span className="ct-value">
        <span title={sum > node.timeMs ? t('ct.timeTotal', { time: fmtDurationShort(sum) }) : undefined}>
          {node.timeMs > 0 ? fmtDurationShort(node.timeMs) : sum > 0 ? <span className="muted">{fmtDurationShort(sum)}</span> : <span className="muted">—</span>}
        </span>
        {costs.length > 0 && (
          <span className="ct-cost">
            {costs.map((c) => (
              <Cost key={c.currency} currency={c.currency} qty={c.qty * node.completions} />
            ))}
          </span>
        )}
      </span>
    </div>
  )
}

/** Plakette mit der Art der Quelle; gibt es mehrere Quellen, wählt ein Klick eine andere */
function ModeBadge({ node, mode }: { node: PlanNode; mode: Mode }) {
  const { state } = useGame()
  const t = useT()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const pinned = !!state.choices[node.item]
  const label = (
    <>
      {pinned && <Sym name="pin" size={10} />}
      {t(`ct.mode.${mode}`)}
    </>
  )
  if (node.alternatives < 2 || mode === 'stock')
    return (
      <span className="ct-mode-cell">
        <span className={`ct-mode ${mode}`} title={mode === 'stock' ? t('tree.haveHint') : undefined}>
          {label}
        </span>
      </span>
    )
  return (
    <span className="ct-mode-cell">
      <button
        className={`ct-mode ${mode} pick`}
        title={t(pinned ? 'ct.pinned' : 'ct.pick')}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {label}
      </button>
      {anchor && <SourceMenu item={node.item} anchor={anchor} onClose={() => setAnchor(null)} />}
    </span>
  )
}

function SourceMenu({ item, anchor, onClose }: { item: Id; anchor: DOMRect; onClose: () => void }) {
  const { index, state, dispatch } = useGame()
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  const sources = rankSources(index, item, state.profile)
  const chosen = state.choices[item]
  const current = (chosen && sources.find((r) => r.id === chosen)) || sources[0]
  const pick = (recipe: Id | null) => {
    dispatch({ type: 'choose', item, recipe })
    onClose()
  }
  const height = 34 + sources.length * 26 + (chosen ? 35 : 0)
  // Im body, damit Tooltip und Hover der Zeile nicht mitgehen
  return createPortal(
    <div
      ref={ref}
      className="context-menu ct-menu"
      role="menu"
      style={{
        left: Math.max(8, Math.min(anchor.right - 280, window.innerWidth - 300)),
        top: anchor.bottom + 4 + height > window.innerHeight ? Math.max(8, anchor.top - 4 - height) : anchor.bottom + 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="menu-title">{t('ct.sourceFor', { name: index.items.get(item)?.name ?? item })}</div>
      {sources.map((r) => {
        const skill = r.skill ? index.skills.get(r.skill) : null
        return (
          <button key={r.id} className="menu-item ct-pick" role="menuitemradio" aria-checked={current?.id === r.id} onClick={() => pick(r.id)}>
            <span className="ct-check">{current?.id === r.id && <Sym name="check" size={11} />}</span>
            <GameIcon src={skill?.icon ?? r.icon} size={16} />
            <span className="grow">{recipeAction(t, r)}</span>
            {r.demoLocked ? <span className="tag locked">Demo</span> : <span className="ct-kind">{t(`ct.mode.${modeOf(r)}`)}</span>}
          </button>
        )
      })}
      {chosen && (
        <>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => pick(null)}>
            {t('insp.auto')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}

export function Materials({ plan }: { plan: Plan }) {
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
                            <GameIcon src={item?.icon} size={20} entity={`item:${id}`} />
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
