import { Fragment, useState, type ReactNode } from 'react'
import { fmtDuration, fmtDurationShort, fmtInt } from '../core/format'
import type { MakeStep } from '../core/planner'
import { GP, type Route, type RouteSegment } from '../core/route'
import { isGoal, solutionXp, type Phase, type Solution } from '../core/solve'
import type { Id, Msg, Recipe, Req } from '../core/types'
import { useT, type T } from '../i18n'
import { GameIcon, LevelTag, Ref, Sym } from './components'
import { useGame } from './state'

/** Wofür das Quell-Symbol eines Rezepts steht: sein Skill, sonst der Shop-Kauf */
export const sourceEntity = (r: { skill: string | null; purchase?: string }) =>
  r.skill ? `skill:${r.skill}` : r.purchase ? `purchase:${r.purchase}` : null

/** Shop-Quelle: in welcher Shop-Kategorie der Kauf steht */
export const shopCategory = (index: { purchases: Map<string, { category: string | null }> }, r: { purchase?: string }) =>
  r.purchase ? (index.purchases.get(r.purchase)?.category ?? null) : null

/** „Normal Tree fällen" / „Cut Normal Tree" */
export const recipeAction = (t: T, r: Recipe) => t(`verb.${r.kind}`, { name: r.name })

/** Übersetzung, in der einzelne Platzhalter React-Knoten sind
 *  („braucht {name}" → der Name als Link) */
export function TNodes({ k, nodes }: { k: string | Msg; nodes: Record<string, ReactNode> }) {
  const t = useT()
  const names = Object.keys(nodes)
  const marks = Object.fromEntries(names.map((n, i) => [n, `\u0000${i}\u0000`]))
  const parts = (typeof k === 'string' ? t(k, marks) : t({ ...k, params: { ...k.params, ...marks } })).split('\u0000')
  return <>{parts.map((p, i) => (i % 2 ? <Fragment key={i}>{nodes[names[Number(p)]]}</Fragment> : p))}</>
}

/** Eine Quelle als Text: „Iron Ore abbauen". Shop-Käufe tragen ihre Kategorie
 *  und verweisen auf den Kauf, sonst verweist der Text aufs erzeugte Item —
 *  außer das ist `self`, das Item, um das es gerade geht. */
export function SourceText({ r, self }: { r: Recipe; self?: Id }) {
  const { index } = useGame()
  const t = useT()
  const category = shopCategory(index, r)
  const out = r.outputs[0]?.item
  const entity = r.purchase ? `purchase:${r.purchase}` : out && out !== self ? `item:${out}` : null
  return (
    <>
      {entity ? <Ref entity={entity}>{recipeAction(t, r)}</Ref> : recipeAction(t, r)}
      {category && <span className="src-cat">{t('tip.shopCategory', { category })}</span>}
    </>
  )
}

/** „braucht X, Y" — jeder Name mit Tooltip, Kontextmenü und Klick */
export function Needs({ reqs, className = 'tag warn' }: { reqs: Req[]; className?: string }) {
  const { index } = useGame()
  const parts = reqs.flatMap((q) => {
    if (q.type === 'purchase') return [{ entity: `purchase:${q.purchase}`, name: q.name }]
    if (q.type === 'item') return [{ entity: `item:${q.item}`, name: index.items.get(q.item)?.name ?? q.item }]
    if (q.type === 'level') return [{ entity: `skill:${q.skill}`, name: `${index.skills.get(q.skill)?.name ?? q.skill} ${q.level}` }]
    return []
  })
  if (!parts.length) return null
  return (
    <span className={className}>
      <TNodes
        k="insp.needs"
        nodes={{
          name: parts.map((x, i) => (
            <Fragment key={x.entity}>
              {i > 0 && ', '}
              <Ref entity={x.entity}>{x.name}</Ref>
            </Fragment>
          )),
        }}
      />
    </span>
  )
}

/** Wofür ein Schritt da ist — mit Verweis, wenn der Löser einen mitgibt */
export function WhyTag({ why }: { why: Msg }) {
  const t = useT()
  const ref = typeof why.params?.ref === 'string' ? why.params.ref : null
  return ref ? (
    <Ref entity={ref} className="tag std">
      {t(why)}
    </Ref>
  ) : (
    <span className="tag std">{t(why)}</span>
  )
}

/** Ein Item-Name als Verweis */
export function ItemName({ id }: { id: Id }) {
  const { index } = useGame()
  return <Ref entity={`item:${id}`}>{index.items.get(id)?.name ?? id}</Ref>
}

/** Zusammenfassung als Pergament-Tafel + Hinweise */
export function SolutionSummary({ solution }: { solution: Solution }) {
  const { index } = useGame()
  const t = useT()
  const xp = [...solutionXp(solution).values()].reduce((a, b) => a + b, 0)
  const goldBefore = solution.before.currencies[GP] ?? 0
  const goldAfter = solution.after.currencies[GP] ?? 0
  const delta = goldAfter - goldBefore
  const ups = index.data.skills
    .map((s) => ({ s, from: solution.before.levels[s.id] ?? 1, to: solution.after.levels[s.id] ?? 1 }))
    .filter((x) => x.to > x.from)
  const gp = index.currencies.get(GP)
  const smart = solution.smart

  return (
    <>
      <div className="plate">
        <div className="plate-cell">
          <div className="plate-label">{t('sum.active')}</div>
          <div className="plate-value">{fmtDuration(solution.activeMs)}</div>
        </div>
        {solution.passiveMs > 0 && (
          <div className="plate-cell">
            <div className="plate-label">{t('sum.passive')}</div>
            <div className="plate-value">{fmtDuration(solution.passiveMs)}</div>
          </div>
        )}
        <div className="plate-cell">
          <div className="plate-label">
            <GameIcon src={gp?.icon} size={14} />
            {t('sum.gold')}
          </div>
          <div className={`plate-value ${goldAfter < 0 ? 'bad' : ''}`}>
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {fmtInt(Math.abs(delta))}
            <small>GP</small>
          </div>
        </div>
        <div className="plate-cell">
          <div className="plate-label">{t('sum.xp')}</div>
          <div className="plate-value">
            {fmtInt(xp)}
            <small>XP</small>
          </div>
        </div>
        <div className="plate-cell">
          <div className="plate-label">{t('sum.levelUps')}</div>
          <div className="plate-value">
            {ups.reduce((s, u) => s + u.to - u.from, 0)}
            <small>{t('sum.inSkills', { n: ups.length })}</small>
          </div>
        </div>
      </div>

      {(ups.length > 0 || solution.problems.length > 0 || solution.notes.length > 0 || smart.checked > 0) && (
        <div className="notes">
          {solution.problems.map((p) => (
            <span key={JSON.stringify(p)} className="note bad">
              <Sym name="warn" size={14} />
              {t(p)}
            </span>
          ))}
          {smart.taken.length > 0 && (
            <span className="note good" title={smart.taken.join(', ')}>
              <Sym name="check" size={14} />
              {t('smart.taken', { n: smart.taken.length, time: fmtDuration(smart.savedMs) })}
            </span>
          )}
          {smart.checked > 0 && smart.taken.length === 0 && (
            <span className="note" title={t('smart.hint')}>
              <Sym name="check" size={14} />
              {t('smart.none', { n: smart.checked })}
            </span>
          )}
          {ups.map(({ s, from, to }) => (
            <span key={s.id} className="note">
              <GameIcon src={s.icon} size={16} entity={`skill:${s.id}`} />
              {s.name}
              <b>
                {from} → {to}
              </b>
            </span>
          ))}
          {solution.notes.map((n) => (
            <span key={n} className="note" title={t('sum.uncheckedHint')}>
              <Sym name="warn" size={14} />
              {t('sum.unchecked', { text: n })}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/** Der schnellste Weg auf einen Blick: nummerierte Phasen mit Zeit */
export function RouteOverview({ solution, onOpen }: { solution: Solution; onOpen?: () => void }) {
  const { index } = useGame()
  const t = useT()
  if (solution.phases.length < 2) return null
  return (
    <div className="overview">
      <div className="overview-title">{t('overview.title')}</div>
      <ol>
        {solution.phases.map((ph, i) => {
          let icon: string | null | undefined
          let entity: string | null = null
          let label: string
          let time: string
          if (ph.kind === 'route') {
            const g = ph.route.goal
            if (g.kind === 'level') {
              const s = index.skills.get(g.skill)
              icon = s?.icon
              entity = `skill:${g.skill}`
              label = `${s?.name ?? g.skill} ${ph.route.before.levels[g.skill] ?? 1} → ${g.level}`
            } else {
              icon = index.currencies.get(GP)?.icon
              label = t('overview.gold', { amount: fmtInt(g.amount) })
            }
            time = fmtDurationShort(ph.route.totalMs)
          } else if (ph.kind === 'buy') {
            icon = ph.purchase.icon
            entity = `purchase:${ph.purchase.id}`
            label = ph.purchase.name
            time = t('flow.shop')
          } else {
            icon = index.items.get(ph.goals[0]?.item)?.icon
            entity = ph.goals[0] ? `item:${ph.goals[0].item}` : null
            label = t('overview.make', { n: ph.plan.steps.length })
            time = fmtDurationShort(ph.plan.activeMs + ph.plan.passiveMs)
          }
          return (
            <li key={i} style={{ '--i': i } as React.CSSProperties}>
              <button onClick={onOpen} title={isGoal(ph.why) ? undefined : t(ph.why)}>
                <span className="n">{i + 1}</span>
                <GameIcon src={icon} size={16} entity={entity} />
                <span className="txt">{label}</span>
                <span className="time">{time}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Nach welchem Schritt die Anforderungen eines Rezepts erfüllt sind (1-basiert) */
export function unlockStep(solution: Solution, r: Recipe): number | null {
  const unmet = r.reqs.filter((q) =>
    q.type === 'level'
      ? (solution.before.levels[q.skill] ?? 1) < q.level
      : q.type === 'purchase'
        ? !(solution.before.owned[q.purchase] > 0)
        : q.type === 'item'
          ? !(solution.before.inventory[q.item] > 0) && !solution.before.equipped?.includes(q.item)
          : false,
  )
  if (!unmet.length) return null
  let step = 0
  for (const q of unmet) {
    const levels = { ...solution.before.levels }
    let found = -1
    solution.phases.some((ph, i) => {
      if (ph.kind === 'route') Object.assign(levels, ph.route.after.levels)
      if (ph.kind === 'craft') Object.assign(levels, ph.at.levels)
      const ok =
        q.type === 'level'
          ? (levels[q.skill] ?? 1) >= q.level
          : q.type === 'purchase'
            ? ph.kind === 'buy' && ph.purchase.id === q.purchase
            : q.type === 'item' && ph.kind === 'craft' && ph.goals.some((g) => g.item === q.item)
      if (ok) found = i
      return ok
    })
    if (found >= 0) step = Math.max(step, found + 1)
  }
  return step || null
}

// Schlüssel der abhakbaren Schritte — einmal hier, damit Zählen und Zeilen übereinstimmen
const segmentKey = (phase: number, i: number, seg: RouteSegment) => `${phase}:${i}:${seg.recipe.id}`
const makeKey = (phase: number, step: MakeStep) => `${phase}:${step.key}`
const buyKey = (phase: number) => `${phase}:buy`

function stepKeys(solution: Solution): string[] {
  return solution.phases.flatMap((ph, i) =>
    ph.kind === 'route'
      ? ph.route.segments.map((s, j) => segmentKey(i, j, s))
      : ph.kind === 'buy'
        ? [buyKey(i)]
        : ph.plan.steps.map((s) => makeKey(i, s)),
  )
}

/** Der Ablauf: Phasen mit abhakbaren Schritten */
export function SolutionFlow({ solution, scope }: { solution: Solution; scope: string }) {
  const { state, dispatch } = useGame()
  const t = useT()
  const key = (k: string) => `${scope}:${k}`
  const keys = stepKeys(solution).map(key)
  const rows = solution.phases.map((ph, i) => <PhaseBlock key={i} phase={ph} index={i} keyFor={key} />)
  const done = keys.filter((k) => state.done[k]).length

  if (!solution.phases.length) {
    return (
      <p className="muted" style={{ margin: '24px 4px' }}>
        {t('flow.nothing')}
      </p>
    )
  }
  return (
    <>
      <div className="group-title" style={{ justifyContent: 'space-between' }}>
        <span>
          {t('flow.title')} <span className="muted">{t('flow.steps', { n: keys.length })}</span>
        </span>
        {done > 0 && (
          <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('flow.done', { n: done })}
            <button className="btn plain small" onClick={() => keys.forEach((k) => state.done[k] && dispatch({ type: 'toggleDone', key: k }))}>
              <Sym name="reset" size={12} /> {t('common.reset')}
            </button>
          </span>
        )}
      </div>
      {rows}
    </>
  )
}

function PhaseBlock({ phase, index, keyFor }: { phase: Phase; index: number; keyFor: (k: string) => string }) {
  const { index: game } = useGame()
  const t = useT()
  if (phase.kind === 'route') return <RouteBlock route={phase.route} why={phase.why} phase={index} keyFor={keyFor} />
  if (phase.kind === 'buy') {
    const price = phase.purchase.costs.find((c) => c.currency === GP)?.qty ?? 0
    return (
      <section className="phase">
        <ol className="steps">
          <StepRow
            k={keyFor(buyKey(index))}
            entity={`purchase:${phase.purchase.id}`}
            icon={phase.purchase.icon}
            title={<TNodes k="flow.buy" nodes={{ name: <Ref entity={`purchase:${phase.purchase.id}`}>{phase.purchase.name}</Ref> }} />}
            sub={
              <>
                <GameIcon src={game.currencies.get(GP)?.icon} size={14} /> {fmtInt(price)} GP
                {phase.purchase.inputs.map((i) => (
                  <span key={i.item}>
                    <GameIcon src={game.items.get(i.item)?.icon} size={14} entity={`item:${i.item}`} /> {fmtInt(i.qty)}
                  </span>
                ))}
                {phase.purchase.category && <span className="muted">{t('tip.shopCategory', { category: phase.purchase.category })}</span>}
                {!isGoal(phase.why) && <WhyTag why={phase.why} />}
                {phase.savesMs ? <span className="tag bonus">{t('flow.saves', { time: fmtDuration(phase.savesMs) })}</span> : null}
              </>
            }
            meta={<b>{t('flow.shop')}</b>}
          />
        </ol>
      </section>
    )
  }
  const steps = phase.plan.steps
  if (!steps.length) return null
  const goals = phase.goals.map((g, i) => (
    <Fragment key={g.item}>
      {i > 0 && ', '}
      {fmtInt(g.qty)}× <ItemName id={g.item} />
    </Fragment>
  ))
  return (
    <section className="phase">
      <PhaseHead
        title={<TNodes k="flow.make" nodes={{ items: goals }} />}
        why={phase.why}
        time={phase.plan.activeMs}
        extra={phase.plan.passiveMs > 0 ? t('flow.growth', { time: fmtDurationShort(phase.plan.passiveMs) }) : undefined}
      />
      <ol className="steps">
        {steps.map((s) => (
          <MakeRow key={s.key} step={s} k={keyFor(makeKey(index, s))} levels={phase.at.levels} />
        ))}
      </ol>
    </section>
  )
}

function PhaseHead({ title, why, time, extra }: { title: React.ReactNode; why: Msg; time: number; extra?: string }) {
  return (
    <div className="phase-head">
      <span className="phase-title">{title}</span>
      {!isGoal(why) && <WhyTag why={why} />}
      <span className="spacer" />
      {extra && <span className="muted">{extra}</span>}
      <span className="phase-time">{fmtDuration(time)}</span>
    </div>
  )
}

function RouteBlock({ route, why, phase, keyFor }: { route: Route; why: Msg; phase: number; keyFor: (k: string) => string }) {
  const { index } = useGame()
  const t = useT()
  const goal = route.goal
  const skill = goal.kind === 'level' ? index.skills.get(goal.skill) : null
  const title =
    goal.kind === 'level' ? (
      <>
        <GameIcon src={skill?.icon} size={18} entity={`skill:${goal.skill}`} />{' '}
        <TNodes
          k={{ key: 'flow.train', params: { from: route.before.levels[goal.skill] ?? 1, to: goal.level } }}
          nodes={{ skill: <Ref entity={`skill:${goal.skill}`}>{skill?.name ?? ''}</Ref> }}
        />
      </>
    ) : (
      <>
        <GameIcon src={index.currencies.get(GP)?.icon} size={18} /> {t('flow.earn', { amount: fmtInt(goal.amount) })}
      </>
    )
  const longest = Math.max(...route.segments.map((s) => s.timeMs))
  return (
    <section className="phase">
      <PhaseHead title={title} why={why} time={route.totalMs} />
      {!route.reached && route.stopReason && (
        <p className="bad" style={{ margin: '0 10px 8px', fontSize: 12 }}>
          {t(route.stopReason)}
        </p>
      )}
      <ol className="steps">
        {route.segments.map((seg, i) => (
          <SegmentRow key={i} seg={seg} route={route} k={keyFor(segmentKey(phase, i, seg))} share={seg.timeMs / longest} />
        ))}
      </ol>
    </section>
  )
}

function SegmentRow({ seg, route, k, share }: { seg: RouteSegment; route: Route; k: string; share: number }) {
  const { index } = useGame()
  const t = useT()
  const [open, setOpen] = useState(false)
  const goal = route.goal
  const r = seg.recipe
  const skill = r.skill ? index.skills.get(r.skill) : null
  const isNew = r.skill && r.level > (route.before.levels[r.skill] ?? 1)
  const chain = [...seg.chain].filter(([id]) => id !== r.id)
  const goalXp = goal.kind === 'level' ? (seg.xp.get(goal.skill) ?? 0) : 0

  return (
    <StepRow
      k={k}
      icon={r.icon}
      entity={r.outputs[0] ? `item:${r.outputs[0].item}` : undefined}
      title={
        <>
          {goal.kind === 'level' ? (
            <span className="range">
              Lv {seg.from} → {seg.to}
            </span>
          ) : (
            <span className="range">
              {fmtInt(seg.from)} → {fmtInt(seg.to)} GP
            </span>
          )}{' '}
          <SourceText r={r} />
        </>
      }
      sub={
        <>
          <span>
            <GameIcon src={skill?.icon} size={14} entity={r.skill ? `skill:${r.skill}` : null} /> {fmtInt(seg.actions)}×
          </span>
          <span>
            {fmtInt(seg.ratePerHour)} {goal.kind === 'level' ? 'XP/h' : 'GP/h'}
          </span>
          {goal.kind === 'level' && <span className="muted">{fmtInt(goalXp)} XP</span>}
          {isNew && <span className="tag std">{t('flow.newAt', { level: r.level })}</span>}
          {chain.length > 0 && (
            <button className="link" onClick={() => setOpen(!open)}>
              {t('flow.chain', { n: chain.length })}
              <Sym name="chevron" size={10} className={open ? 'rot' : ''} />
            </button>
          )}
          {open && (
            <span className="chain">
              {chain.map(([id, n]) => {
                const cr = index.recipes.get(id)!
                return (
                  <span key={id}>
                    <GameIcon src={cr.icon} size={14} entity={cr.outputs[0] ? `item:${cr.outputs[0].item}` : null} /> {fmtInt(Math.ceil(n))}× <SourceText r={cr} />
                  </span>
                )
              })}
            </span>
          )}
        </>
      }
      meta={
        <>
          <b>{fmtDurationShort(seg.timeMs)}</b>
          <span className="bar">
            <span style={{ width: `${Math.max(3, share * 100)}%` }} />
          </span>
        </>
      }
    />
  )
}

function MakeRow({ step, k, levels }: { step: MakeStep; k: string; levels: Record<string, number> }) {
  const { index } = useGame()
  const t = useT()
  const r = step.recipe
  const item = index.items.get(step.item)
  const skill = r.skill ? index.skills.get(r.skill) : null
  return (
    <StepRow
      k={k}
      entity={`item:${step.item}`}
      icon={item?.icon ?? r.icon}
      title={
        <>
          {fmtInt(step.amount)}× <Ref entity={`item:${step.item}`}>{item?.name ?? step.item}</Ref>
        </>
      }
      sub={
        <>
          {skill && <GameIcon src={skill.icon} size={14} entity={`skill:${skill.id}`} />}
          <SourceText r={r} self={step.item} />
          {step.completions !== step.amount && <span className="muted">{t('flow.runs', { n: fmtInt(step.completions) })}</span>}
          <LevelTag level={r.level} have={r.skill ? (levels[r.skill] ?? 1) : 1} />
        </>
      }
      meta={
        <>
          <b>{r.timeMs > 0 ? fmtDurationShort(step.timeMs) : t('flow.instant')}</b>
          {step.xp > 0 && <span>{fmtInt(step.xp)} XP</span>}
        </>
      }
    />
  )
}

function StepRow({
  k,
  icon,
  title,
  sub,
  meta,
  entity,
}: {
  k: string
  icon: string | null | undefined
  title: React.ReactNode
  sub: React.ReactNode
  meta: React.ReactNode
  /** „item:<id>" — Tooltip und Kontextmenü */
  entity?: string
}) {
  const { state, dispatch } = useGame()
  const t = useT()
  const done = !!state.done[k]
  return (
    <li className={`step ${done ? 'done' : ''}`} data-entity={entity}>
      <button className="check" role="checkbox" aria-checked={done} aria-label={t('flow.markDone')} onClick={() => dispatch({ type: 'toggleDone', key: k })}>
        {done && <Sym name="check" size={12} />}
      </button>
      <GameIcon src={icon} size={26} entity={entity} />
      <div className="what">
        <b>{title}</b>
        <div className="sub">{sub}</div>
      </div>
      <div className="meta">{meta}</div>
    </li>
  )
}
