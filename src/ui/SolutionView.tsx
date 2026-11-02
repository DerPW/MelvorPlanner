import { useState } from 'react'
import { fmtDuration, fmtDurationShort, fmtInt } from '../core/format'
import type { MakeStep } from '../core/planner'
import { GP, type Route, type RouteSegment } from '../core/route'
import { solutionXp, type Phase, type Solution } from '../core/solve'
import type { Recipe } from '../core/types'
import { GameIcon, LevelTag, Sym } from './components'
import { useGame } from './state'

const VERB: Record<string, string> = {
  artisan: 'herstellen',
  cooking: 'kochen',
  woodcutting: 'fällen',
  mining: 'abbauen',
  fishing: 'angeln',
  firemaking: '',
  thieving: 'bestehlen',
  farming: 'anbauen',
  mill: 'mahlen',
  shop: 'kaufen',
  upgrade: 'aufwerten',
}
export const recipeAction = (r: Recipe) => (VERB[r.kind] ? `${r.name} ${VERB[r.kind]}` : r.name)

/** Zusammenfassung als Pergament-Tafel + Hinweise */
export function SolutionSummary({ solution }: { solution: Solution }) {
  const { index } = useGame()
  const xp = [...solutionXp(solution).values()].reduce((a, b) => a + b, 0)
  const goldBefore = solution.before.currencies[GP] ?? 0
  const goldAfter = solution.after.currencies[GP] ?? 0
  const delta = goldAfter - goldBefore
  const ups = index.data.skills
    .map((s) => ({ s, from: solution.before.levels[s.id] ?? 1, to: solution.after.levels[s.id] ?? 1 }))
    .filter((x) => x.to > x.from)
  const gp = index.currencies.get(GP)

  return (
    <>
      <div className="plate">
        <div className="plate-cell">
          <div className="plate-label">Aktive Zeit</div>
          <div className="plate-value">{fmtDuration(solution.activeMs)}</div>
        </div>
        {solution.passiveMs > 0 && (
          <div className="plate-cell">
            <div className="plate-label">Wartezeit Farming</div>
            <div className="plate-value">{fmtDuration(solution.passiveMs)}</div>
          </div>
        )}
        <div className="plate-cell">
          <div className="plate-label">
            <GameIcon src={gp?.icon} size={14} />
            Gold
          </div>
          <div className={`plate-value ${goldAfter < 0 ? 'bad' : ''}`}>
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {fmtInt(Math.abs(delta))}
            <small>GP</small>
          </div>
        </div>
        <div className="plate-cell">
          <div className="plate-label">Erfahrung</div>
          <div className="plate-value">
            {fmtInt(xp)}
            <small>XP</small>
          </div>
        </div>
        <div className="plate-cell">
          <div className="plate-label">Level-Ups</div>
          <div className="plate-value">
            {ups.reduce((s, u) => s + u.to - u.from, 0)}
            <small>in {ups.length} Skills</small>
          </div>
        </div>
      </div>

      {(ups.length > 0 || solution.problems.length > 0 || solution.notes.length > 0) && (
        <div className="notes">
          {solution.problems.map((p) => (
            <span key={p} className="note bad">
              <Sym name="warn" size={14} />
              {p}
            </span>
          ))}
          {ups.map(({ s, from, to }) => (
            <span key={s.id} className="note">
              <GameIcon src={s.icon} size={16} />
              {s.name}
              <b>
                {from} → {to}
              </b>
            </span>
          ))}
          {solution.notes.map((n) => (
            <span key={n} className="note" title="Kann der Planer nicht prüfen">
              <Sym name="warn" size={14} />
              Nicht geprüft: {n}
            </span>
          ))}
        </div>
      )}
    </>
  )
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
  const key = (k: string) => `${scope}:${k}`
  const keys = stepKeys(solution).map(key)
  const rows = solution.phases.map((ph, i) => <PhaseBlock key={i} phase={ph} index={i} keyFor={key} />)
  const done = keys.filter((k) => state.done[k]).length

  if (!solution.phases.length) {
    return <p className="muted" style={{ margin: '24px 4px' }}>Nichts zu tun — das Ziel ist mit deinem Stand schon erreicht.</p>
  }
  return (
    <>
      <div className="group-title" style={{ justifyContent: 'space-between' }}>
        <span>
          Ablauf <span className="muted">{fmtInt(keys.length)} Schritte</span>
        </span>
        {done > 0 && (
          <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {done} erledigt
            <button className="btn plain small" onClick={() => keys.forEach((k) => state.done[k] && dispatch({ type: 'toggleDone', key: k }))}>
              <Sym name="reset" size={12} /> Zurücksetzen
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
  if (phase.kind === 'route') return <RouteBlock route={phase.route} why={phase.why} phase={index} keyFor={keyFor} />
  if (phase.kind === 'buy') {
    const k = keyFor(buyKey(index))
    const price = phase.purchase.costs.find((c) => c.currency === GP)?.qty ?? 0
    return (
      <section className="phase">
        <ol className="steps">
          <StepRow
            k={k}
            icon={phase.purchase.icon}
            title={<>„{phase.purchase.name}" kaufen</>}
            sub={
              <>
                <GameIcon src={game.currencies.get(GP)?.icon} size={14} /> {fmtInt(price)} GP
                {phase.purchase.inputs.map((i) => (
                  <span key={i.item}>
                    <GameIcon src={game.items.get(i.item)?.icon} size={14} /> {fmtInt(i.qty)}
                  </span>
                ))}
                {phase.why !== 'Ziel' && <span className="tag std">{phase.why}</span>}
              </>
            }
            meta={<b>Shop</b>}
          />
        </ol>
      </section>
    )
  }
  const steps = phase.plan.steps
  if (!steps.length) return null
  const goalText = phase.goals.map((g) => `${fmtInt(g.qty)}× ${game.items.get(g.item)?.name ?? g.item}`).join(', ')
  return (
    <section className="phase">
      <PhaseHead
        title={<>Herstellen: {goalText}</>}
        why={phase.why}
        time={phase.plan.activeMs}
        extra={phase.plan.passiveMs > 0 ? `+ ${fmtDurationShort(phase.plan.passiveMs)} Wachstum` : undefined}
      />
      <ol className="steps">
        {steps.map((s) => (
          <MakeRow key={s.key} step={s} k={keyFor(makeKey(index, s))} levels={phase.at.levels} />
        ))}
      </ol>
    </section>
  )
}

function PhaseHead({ title, why, time, extra }: { title: React.ReactNode; why: string; time: number; extra?: string }) {
  return (
    <div className="phase-head">
      <span className="phase-title">{title}</span>
      {why !== 'Ziel' && <span className="tag std">{why}</span>}
      <span className="spacer" />
      {extra && <span className="muted">{extra}</span>}
      <span className="phase-time">{fmtDuration(time)}</span>
    </div>
  )
}

function RouteBlock({ route, why, phase, keyFor }: { route: Route; why: string; phase: number; keyFor: (k: string) => string }) {
  const { index } = useGame()
  const goal = route.goal
  const skill = goal.kind === 'level' ? index.skills.get(goal.skill) : null
  const title =
    goal.kind === 'level' ? (
      <>
        <GameIcon src={skill?.icon} size={18} /> {skill?.name} {route.before.levels[goal.skill] ?? 1} → {goal.level} trainieren
      </>
    ) : (
      <>
        <GameIcon src={index.currencies.get(GP)?.icon} size={18} /> {fmtInt(goal.amount)} GP verdienen
      </>
    )
  const longest = Math.max(...route.segments.map((s) => s.timeMs))
  return (
    <section className="phase">
      <PhaseHead title={title} why={why} time={route.totalMs} />
      {!route.reached && route.stopReason && (
        <p className="bad" style={{ margin: '0 10px 8px', fontSize: 12 }}>
          {route.stopReason}
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
  const [open, setOpen] = useState(false)
  const goal = route.goal
  const r = seg.recipe
  const skill = r.skill ? index.skills.get(r.skill) : null
  const isNew = r.skill && r.level > (route.before.levels[r.skill] ?? 1)
  const chain = [...seg.chain].filter(([id]) => id !== r.id)
  const goalXp = goal.kind === 'level' ? seg.xp.get(goal.skill) ?? 0 : 0

  return (
    <StepRow
      k={k}
      icon={r.icon}
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
          {recipeAction(r)}
        </>
      }
      sub={
        <>
          <span>
            <GameIcon src={skill?.icon} size={14} /> {fmtInt(seg.actions)}×
          </span>
          <span>
            {fmtInt(seg.ratePerHour)} {goal.kind === 'level' ? 'XP/h' : 'GP/h'}
          </span>
          {goal.kind === 'level' && <span className="muted">{fmtInt(goalXp)} XP</span>}
          {isNew && <span className="tag std">neu ab Lv {r.level}</span>}
          {chain.length > 0 && (
            <button className="link" onClick={() => setOpen(!open)}>
              dafür {chain.length} Vorstufe{chain.length > 1 ? 'n' : ''}
              <Sym name="chevron" size={10} className={open ? 'rot' : ''} />
            </button>
          )}
          {open && (
            <span className="chain">
              {chain.map(([id, n]) => {
                const cr = index.recipes.get(id)!
                return (
                  <span key={id}>
                    <GameIcon src={cr.icon} size={14} /> {fmtInt(Math.ceil(n))}× {recipeAction(cr)}
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
  const r = step.recipe
  const item = index.items.get(step.item)
  const skill = r.skill ? index.skills.get(r.skill) : null
  return (
    <StepRow
      k={k}
      icon={item?.icon ?? r.icon}
      title={
        <>
          {fmtInt(step.amount)}× {item?.name ?? step.item}
        </>
      }
      sub={
        <>
          {skill && <GameIcon src={skill.icon} size={14} />}
          {recipeAction(r)}
          {step.completions !== step.amount && <span className="muted">{fmtInt(step.completions)} Durchläufe</span>}
          <LevelTag level={r.level} have={r.skill ? (levels[r.skill] ?? 1) : 1} />
        </>
      }
      meta={
        <>
          <b>{r.timeMs > 0 ? fmtDurationShort(step.timeMs) : 'sofort'}</b>
          {step.xp > 0 && <span>{fmtInt(step.xp)} XP</span>}
        </>
      }
    />
  )
}

function StepRow({ k, icon, title, sub, meta }: { k: string; icon: string | null | undefined; title: React.ReactNode; sub: React.ReactNode; meta: React.ReactNode }) {
  const { state, dispatch } = useGame()
  const done = !!state.done[k]
  return (
    <li className={`step ${done ? 'done' : ''}`}>
      <button className="check" role="checkbox" aria-checked={done} aria-label="Erledigt" onClick={() => dispatch({ type: 'toggleDone', key: k })}>
        {done && <Sym name="check" size={12} />}
      </button>
      <GameIcon src={icon} size={26} />
      <div className="what">
        <b>{title}</b>
        <div className="sub">{sub}</div>
      </div>
      <div className="meta">{meta}</div>
    </li>
  )
}
