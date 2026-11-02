import { createContext, Fragment, useContext, type ReactNode } from 'react'
import { xpForLevel } from '../core/experience'
import { fmtDuration, fmtDurationShort, fmtInt } from '../core/format'
import { liveAmount, liveProgress, liveRemaining, type LiveStep } from '../core/live'
import { isUnlocked, unlockReqFor, unmetReqs, yieldOf, type GameIndex, type MakeStep, type UnlockReq } from '../core/planner'
import { GP, type Route, type RouteSegment } from '../core/route'
import { isGoal, solutionXp, type Phase, type Solution } from '../core/solve'
import type { Id, Msg, Profile, Purchase, Recipe, Req } from '../core/types'
import { useT, type T } from '../i18n'
import { GameIcon, LevelTag, Ref, Sym, useNow } from './components'
import { useGame } from './state'

/** Wofür das Quell-Symbol eines Rezepts steht: sein Skill, sonst der Shop-Kauf */
export const sourceEntity = (r: { skill: string | null; purchase?: string; combat?: { enemy: string } }) =>
  r.combat ? `enemy:${r.combat.enemy}` : r.skill ? `skill:${r.skill}` : r.purchase ? `purchase:${r.purchase}` : null

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
export function SourceText({ r }: { r: Recipe; self?: Id }) {
  const { index } = useGame()
  const t = useT()
  const category = shopCategory(index, r)
  // Die Quelle ist eine Aktion: Kampf → Monster, Kauf → Kauf, sonst ihre eigene Seite
  // (nicht das erste Produkt — bei Beutetabellen wäre das ein Zufalls-Item)
  const entity = r.combat ? `enemy:${r.combat.enemy}` : r.purchase ? `purchase:${r.purchase}` : `recipe:${r.id}`
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
  const t = useT()
  const parts = reqs.map((q) => reqPart(index, q, t))
  if (!parts.length) return null
  return (
    <span className={className}>
      <TNodes
        k="insp.needs"
        nodes={{
          name: parts.map((x, i) => (
            <Fragment key={i}>
              {i > 0 && ', '}
              {x.entity ? <Ref entity={x.entity}>{x.name}</Ref> : x.name}
            </Fragment>
          )),
        }}
      />
    </span>
  )
}

/** Eine Anforderung als Text mit Verweis — „Cooking 10", „20× Raw Shrimp (Fishing)" */
export function reqPart(index: GameIndex, q: Req, t: T): { entity: string | null; name: string; icon: string | null } {
  const enemy = (id: Id) => index.data.enemies?.find((e) => e.id === id)
  switch (q.type) {
    case 'level':
      return { entity: `skill:${q.skill}`, name: `${index.skills.get(q.skill)?.name ?? q.skill} ${q.level}`, icon: index.skills.get(q.skill)?.icon ?? null }
    case 'purchase':
      return { entity: `purchase:${q.purchase}`, name: q.name, icon: index.purchases.get(q.purchase)?.icon ?? null }
    case 'item':
      return { entity: `item:${q.item}`, name: index.items.get(q.item)?.name ?? q.item, icon: index.items.get(q.item)?.icon ?? null }
    case 'unlock':
      return { entity: featureEntity(index, q.feature), name: t('need.unlock', { name: q.name }), icon: featureIcon(index, q.feature) }
    case 'gained': {
      const name = index.items.get(q.item)?.name ?? q.item
      const via = q.skill ? index.skills.get(q.skill)?.name : null
      return { entity: `item:${q.item}`, name: t(via ? 'need.gainedVia' : 'need.gained', { n: fmtInt(q.qty), name, skill: via ?? '' }), icon: index.items.get(q.item)?.icon ?? null }
    }
    case 'killed':
      return { entity: `enemy:${q.enemy}`, name: t('need.killed', { n: fmtInt(q.qty), name: enemy(q.enemy)?.name ?? q.enemy }), icon: enemy(q.enemy)?.icon ?? null }
    case 'trapped':
      return { entity: null, name: t('need.trapped', { n: fmtInt(q.qty), name: q.name }), icon: index.skills.get('MelvorBase:Hunting')?.icon ?? null }
    case 'sold':
      return { entity: null, name: t('need.sold', { n: fmtInt(q.qty) }), icon: index.currencies.get(GP)?.icon ?? null }
    default:
      return { entity: null, name: q.text, icon: null }
  }
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

/** Ist der Skill/Bereich gesperrt? Dann mit seiner Freischaltung und den offenen Bedingungen */
export function featureLock(index: GameIndex, profile: Profile, feature: Id): { req: UnlockReq; unmet: Req[] } | null {
  const req = unlockReqFor(index, feature)
  if (!req || isUnlocked(profile, req)) return null
  return { req, unmet: unmetReqs(req.reqs, profile) }
}

/** Symbol und Verweis eines Skills/Bereichs (Shop, Kampf, Bank haben keine Detailseite) */
export const featureEntity = (index: GameIndex, feature: Id) => (index.skills.has(feature) ? `skill:${feature}` : null)
export const featureIcon = (index: GameIndex, feature: Id) => index.skills.get(feature)?.icon ?? index.features.get(feature)?.icon ?? null

/** Symbol zu einer Entität „typ:id" */
export function entityIcon(index: GameIndex, entity: string): string | null {
  const i = entity.indexOf(':')
  const type = entity.slice(0, i)
  const id = entity.slice(i + 1)
  if (type === 'item') return index.items.get(id)?.icon ?? null
  if (type === 'skill') return index.skills.get(id)?.icon ?? null
  if (type === 'purchase') return index.purchases.get(id)?.icon ?? null
  if (type === 'enemy') return index.data.enemies?.find((e) => e.id === id)?.icon ?? null
  return null
}

/** Ein Item-Name als Verweis */
export function ItemName({ id }: { id: Id }) {
  const { index } = useGame()
  return <Ref entity={`item:${id}`}>{index.items.get(id)?.name ?? id}</Ref>
}

/** Zusammenfassung als Pergament-Tafel + Hinweise */
/** Kennzahlen eines Wegs: Gold-Bilanz, XP, Level-Ups */
function summaryOf(index: GameIndex, solution: Solution) {
  const xp = [...solutionXp(solution).values()].reduce((a, b) => a + b, 0)
  const goldBefore = solution.before.currencies[GP] ?? 0
  const goldAfter = solution.after.currencies[GP] ?? 0
  const ups = index.data.skills
    .map((s) => ({ s, from: solution.before.levels[s.id] ?? 1, to: solution.after.levels[s.id] ?? 1 }))
    .filter((x) => x.to > x.from)
  return { xp, delta: goldAfter - goldBefore, goldAfter, ups }
}

/** Pergament-Tafel mit den Kennzahlen (Zeit steht im Kopf der Route) */
export function SummaryPlate({ solution, steps }: { solution: Solution; steps: number }) {
  const { index } = useGame()
  const t = useT()
  const { xp, delta, goldAfter, ups } = summaryOf(index, solution)
  const gp = index.currencies.get(GP)
  return (
    <div className="plate">
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
      <div className="plate-cell">
        <div className="plate-label">{t('sum.steps')}</div>
        <div className="plate-value">{fmtInt(steps)}</div>
      </div>
    </div>
  )
}

/** Hinweise zum Weg: Probleme, geprüfte Umwege, Level-Ups, Ungeprüftes */
export function SolutionNotes({ solution }: { solution: Solution }) {
  const { index } = useGame()
  const t = useT()
  const { ups } = summaryOf(index, solution)
  const smart = solution.smart
  if (!(ups.length > 0 || solution.problems.length > 0 || solution.notes.length > 0 || smart.checked > 0)) return null
  return (
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
const chainKey = (segKey: string, recipe: string) => `${segKey}>${recipe}`
const makeKey = (phase: number, step: MakeStep) => `${phase}:${step.key}`
const buyKey = (phase: number) => `${phase}:buy`
const unlockKey = (phase: number, feature: string) => `${phase}:unlock:${feature}`
const taskKey = (phase: number) => `${phase}:task`

export function stepKeys(solution: Solution): string[] {
  return solution.phases.flatMap((ph, i) =>
    ph.kind === 'route'
      ? ph.route.segments.flatMap((s, j) => [
          ...[...s.chain.keys()].filter((id) => id !== s.recipe.id).map((id) => chainKey(segmentKey(i, j, s), id)),
          segmentKey(i, j, s),
        ])
      : ph.kind === 'buy'
        ? [buyKey(i)]
        : ph.kind === 'unlock'
          ? [unlockKey(i, ph.feature)]
          : ph.kind === 'task'
            ? [taskKey(i)]
            : ph.plan.steps.map((s) => makeKey(i, s)),
  )
}

/** Vorstufen eines Abschnitts in Herstell-Reihenfolge: Tiefensuche ab dem
 *  Hauptrezept, jede Vorstufe nach ihren eigenen Zutaten („erst Sand kaufen,
 *  dann Glas, dann die Kugel“). Dazu die Tiefe (fürs Einrücken) und wofür sie
 *  gebraucht wird; eine Zutat für mehrere steht beim ersten. */
export function chainOrder(index: GameIndex, seg: RouteSegment): { id: Id; runs: number; depth: number; feeds: Id[] }[] {
  const entries = [...seg.chain].filter(([id]) => id !== seg.recipe.id && index.recipes.has(id))
  const runs = new Map(entries)
  const itemOf = (id: Id) => seg.chainItem.get(id) ?? index.recipes.get(id)?.outputs[0]?.item
  const byItem = new Map(entries.map(([id]) => [itemOf(id), id]))
  const all = [seg.recipe.id, ...entries.map(([id]) => id)]
  const productOf = (id: Id) => (id === seg.recipe.id ? seg.recipe.outputs[0]?.item : itemOf(id))
  const feeds = (id: Id) =>
    all
      .filter((o) => o !== id && index.recipes.get(o)?.inputs.some((i) => i.item === itemOf(id)))
      .map(productOf)
      .filter((x): x is Id => !!x)
  const out: { id: Id; runs: number; depth: number; feeds: Id[] }[] = []
  const seen = new Set<Id>()
  const visit = (rid: Id, depth: number) => {
    for (const input of index.recipes.get(rid)?.inputs ?? []) {
      const c = byItem.get(input.item)
      if (!c || seen.has(c)) continue
      seen.add(c)
      visit(c, depth + 1)
      out.push({ id: c, runs: runs.get(c)!, depth, feeds: feeds(c) })
    }
  }
  visit(seg.recipe.id, 1)
  for (const [id, n] of entries) if (!seen.has(id)) out.push({ id, runs: n, depth: 1, feeds: feeds(id) })
  return out
}

/** Ein „Jetzt dran“-Block des Ablaufs: ein Trainings-Abschnitt samt
 *  Vorstufen, ein Herstell-Schritt, ein Kauf oder eine Aufgabe */
export interface FlowGroup {
  kind: 'train' | 'make' | 'buy' | 'task'
  /** Hauptrezept (Training/Herstellen) — gleiche Hauptrezepte gehören zusammen */
  main: Recipe | null
  /** Rezepte, deren Ausführung zu diesem Block passt */
  recipes: Recipe[]
  keys: string[]
  /** geplante Zeit */
  ms: number
  /** Schritte mit Rezept, Menge und Zeit — für Restzeit und Namen */
  steps: { recipe: Recipe; item?: Id; amount: number; ms: number; xp?: { skill: Id; amount: number } }[]
  purchase?: Purchase
  text?: Msg
}

/** Der Ablauf als Blöcke, in der Reihenfolge, in der sie dran sind (Freischaltungen sind Meilensteine, keine Blöcke) */
export function flowGroups(index: GameIndex, solution: Solution): FlowGroup[] {
  const out: FlowGroup[] = []
  solution.phases.forEach((ph, i) => {
    if (ph.kind === 'route') {
      ph.route.segments.forEach((seg, j) => {
        const k = segmentKey(i, j, seg)
        const chain = chainOrder(index, seg).map((c) => [c.id, c.runs] as const)
        const goalSkill = ph.route.goal.kind === 'level' ? ph.route.goal.skill : null
        // XP bis zum Abschnittsende: der erste Abschnitt genau ab dem Stand
        // (fürs Mitmessen), spätere in ganzen Aktionen
        const xpNeed = !goalSkill
          ? 0
          : j === 0
            ? Math.max(0, xpForLevel(seg.to) - (ph.route.before.xp?.[goalSkill] ?? xpForLevel(seg.from)))
            : (seg.xp.get(goalSkill) ?? 0)
        out.push({
          kind: 'train',
          main: seg.recipe,
          recipes: [...chain.map(([id]) => index.recipes.get(id)!), seg.recipe],
          keys: [...chain.map(([id]) => chainKey(k, id)), k],
          ms: seg.timeMs,
          steps: [
            ...chain.map(([id, runs]) => {
              const r = index.recipes.get(id)!
              const item = seg.chainItem.get(id) ?? r.outputs[0]?.item
              const per = item ? r.outputs.filter((o) => o.item === item).reduce((n, o) => n + o.qty * o.chance, 0) : 1
              return { recipe: r, item, amount: runs * per, ms: seg.chainMs.get(id) ?? 0 }
            }),
            {
              recipe: seg.recipe,
              amount: seg.actions,
              ms: seg.chainMs.get(seg.recipe.id) ?? seg.timeMs,
              xp: goalSkill ? { skill: goalSkill, amount: xpNeed } : undefined,
            },
          ],
        })
      })
    } else if (ph.kind === 'craft') {
      for (const step of ph.plan.steps)
        out.push({
          kind: 'make',
          main: step.recipe,
          recipes: [step.recipe],
          keys: [makeKey(i, step)],
          ms: step.timeMs,
          steps: [{ recipe: step.recipe, item: step.item, amount: step.amount, ms: step.timeMs }],
        })
    } else if (ph.kind === 'buy') out.push({ kind: 'buy', main: null, recipes: [], keys: [buyKey(i)], ms: 0, steps: [], purchase: ph.purchase })
    else if (ph.kind === 'task') out.push({ kind: 'task', main: null, recipes: [], keys: [taskKey(i)], ms: 0, steps: [], text: ph.text })
  })
  return out
}

/** Was jetzt dran ist: der erste Block, dazu folgende mit demselben Hauptrezept
 *  (z. B. erst aus dem Lager, dann mit Beschaffung — die Reihenfolge ist egal) */
export function currentGroups(groups: FlowGroup[]): FlowGroup[] {
  const first = groups[0]
  if (!first) return []
  const out = [first]
  for (const g of groups.slice(1)) {
    if (!first.main || g.main?.id !== first.main.id) break
    out.push(g)
  }
  return out
}

/** Highlight der Route: diese Schritte sind dran, dieser läuft gerade (`step`: gemessen) */
export const TrackContext = createContext<{ current: Set<string>; live: Set<string>; step: LiveStep | null } | null>(null)

/** Der Ablauf: Phasen mit abhakbaren Schritten */
/** Alternativen je Schritt — die Route reicht ihre gemiedenen Wege durch */
export interface AvoidApi {
  /** gemiedene Schlüssel, in der Reihenfolge, in der sie dazukamen */
  avoided: string[]
  avoid: (key: string) => void
  allow: (key: string) => void
}
const AvoidContext = createContext<AvoidApi | null>(null)

/** Was ein Schritt liefert: ein Item oder Training in einem Skill */
type StepGoal = { item?: Id; skill?: Id | null }

/** „Alternative ‹ ›“ für einen Schritt: › meidet seinen Weg, ‹ erlaubt den
 *  zuletzt gemiedenen Weg wieder, der dasselbe liefert (dasselbe Item bzw.
 *  Training im selben Skill) */
function useAlternative(key: string | undefined, goal: StepGoal) {
  const api = useContext(AvoidContext)
  const { index } = useGame()
  if (!api || !key) return null
  const same = (k: string) => {
    if (k.startsWith('purchase:')) {
      const p = index.purchases.get(k.slice(9))
      return !!goal.item && !!p?.items.some((i) => i.item === goal.item)
    }
    const r = index.recipes.get(k)
    if (!r) return false
    return goal.item ? r.outputs.some((o) => o.item === goal.item) : !!goal.skill && r.skill === goal.skill
  }
  const back = [...api.avoided].reverse().find(same)
  return { next: () => api.avoid(key), back: back ? () => api.allow(back) : undefined }
}

function AltControl({ alt, compact }: { alt: ReturnType<typeof useAlternative>; compact?: boolean }) {
  const t = useT()
  if (!alt) return null
  return (
    <span className={`step-alt ${compact ? 'compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      {alt.back && (
        <button title={t('alt.backHint')} aria-label={t('alt.backHint')} onClick={alt.back}>
          <Sym name="chevron" size={10} className="flip" />
        </button>
      )}
      <button title={t('alt.otherHint')} aria-label={t('alt.otherHint')} onClick={alt.next}>
        {!compact && <span>{t('alt.other')}</span>}
        <Sym name="chevron" size={10} />
      </button>
    </span>
  )
}

/** Schlüssel, unter dem ein Rezept gemieden wird: Shop-Quellen meiden den Kauf */
export const avoidKey = (r: Recipe) => (r.purchase ? `purchase:${r.purchase}` : r.id)

export function SolutionFlow({ solution, scope, alternatives }: { solution: Solution; scope: string; alternatives?: AvoidApi }) {
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
      <AvoidContext.Provider value={alternatives ?? null}>
        <div className="flow-phases">{rows}</div>
      </AvoidContext.Provider>
    </>
  )
}

function PhaseBlock({ phase, index, keyFor }: { phase: Phase; index: number; keyFor: (k: string) => string }) {
  const { index: game } = useGame()
  const t = useT()
  if (phase.kind === 'route') return <RouteBlock route={phase.route} why={phase.why} phase={index} keyFor={keyFor} />
  if (phase.kind === 'unlock') {
    const entity = featureEntity(game, phase.feature)
    return (
      <section className="phase">
        <ol className="steps">
          <StepRow
            k={keyFor(unlockKey(index, phase.feature))}
            entity={entity ?? undefined}
            icon={featureIcon(game, phase.feature)}
            title={<TNodes k="flow.unlock" nodes={{ name: entity ? <Ref entity={entity}>{phase.name}</Ref> : phase.name }} />}
            sub={
              <>
                <span className="muted">{t('flow.unlockHint')}</span>
                {!isGoal(phase.why) && <WhyTag why={phase.why} />}
              </>
            }
            meta={
              <b className="ok">
                <Sym name="unlock" size={13} /> {t('flow.unlocked')}
              </b>
            }
          />
        </ol>
      </section>
    )
  }
  if (phase.kind === 'task') {
    return (
      <section className="phase">
        <ol className="steps">
          <StepRow
            k={keyFor(taskKey(index))}
            entity={phase.entity ?? undefined}
            icon={phase.entity ? entityIcon(game, phase.entity) : null}
            title={t(phase.text)}
            sub={
              <>
                <span className="muted">{t('flow.taskHint')}</span>
                {!isGoal(phase.why) && <WhyTag why={phase.why} />}
              </>
            }
            meta={<b>{t('flow.byHand')}</b>}
          />
        </ol>
      </section>
    )
  }
  if (phase.kind === 'buy') {
    const price = phase.purchase.costs.find((c) => c.currency === GP)?.qty ?? 0
    return (
      <section className="phase">
        <ol className="steps">
          <StepRow
            k={keyFor(buyKey(index))}
            avoid={isGoal(phase.why) ? undefined : `purchase:${phase.purchase.id}`}
            goal={{ item: phase.purchase.items[0]?.item }}
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
        keys={steps.map((s) => keyFor(makeKey(index, s)))}
        single={steps.length === 1}
      />
      <ol className="steps">
        {steps.map((s) => (
          <MakeRow key={s.key} step={s} k={keyFor(makeKey(index, s))} levels={phase.at.levels} />
        ))}
      </ol>
      <StockUse used={phase.plan.stockUsed} />
    </section>
  )
}

/** Kopf eines Abschnitts. Die Zeit fehlt, wenn er nur einen Schritt hat (sie
 *  stünde doppelt da); läuft einer seiner Schritte gemessen, zählt sie mit */
function PhaseHead({ title, why, time, extra, keys, single }: { title: React.ReactNode; why: Msg; time: number; extra?: string; keys: string[]; single?: boolean }) {
  const track = useContext(TrackContext)
  const live = track?.step && track.step.perMs > 0 && keys.includes(track.step.key) ? track.step : null
  return (
    <div className="phase-head">
      <span className="phase-title">{title}</span>
      {!isGoal(why) && <WhyTag why={why} />}
      <span className="spacer" />
      {extra && <span className="muted">{extra}</span>}
      {!single && (live ? <LivePhaseTime step={live} rest={time - live.planMs} /> : <span className="phase-time">{fmtDuration(time)}</span>)}
    </div>
  )
}

/** Abschnittszeit mit dem laufenden Schritt gemessen: der Rest geplant, der Schritt heruntergezählt */
function LivePhaseTime({ step, rest }: { step: LiveStep; rest: number }) {
  const t = useT()
  const now = useNow(1000)
  return (
    <span className="phase-time live-time" title={t('track.measuredHint')}>
      {fmtDuration(Math.max(0, rest) + liveRemaining(step, now))}
    </span>
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
      <PhaseHead
        title={title}
        why={why}
        time={route.totalMs}
        keys={route.segments.flatMap((seg, i) => {
          const k = keyFor(segmentKey(phase, i, seg))
          return [k, ...[...seg.chain.keys()].map((id) => chainKey(k, id))]
        })}
        single={route.segments.length === 1 && ![...route.segments[0].chain.keys()].some((id) => id !== route.segments[0].recipe.id && index.recipes.has(id))}
      />
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
      <StockUse used={route.consumed} />
    </section>
  )
}

function SegmentRow({ seg, route, k, share }: { seg: RouteSegment; route: Route; k: string; share: number }) {
  const { index } = useGame()
  const t = useT()
  const goal = route.goal
  const r = seg.recipe
  const skill = r.skill ? index.skills.get(r.skill) : null
  const isNew = r.skill && r.level > (route.before.levels[r.skill] ?? 1)
  // Vorstufen (Material beschaffen) stehen als eigene Schritte davor — in Herstell-Reihenfolge
  const chain = chainOrder(index, seg)
  const goalXp = goal.kind === 'level' ? (seg.xp.get(goal.skill) ?? 0) : 0
  const ownMs = seg.chainMs.get(r.id) ?? seg.timeMs

  const rows = (
    <>
      {chain.map((c) => (
        <ChainStep
          key={c.id}
          r={index.recipes.get(c.id)!}
          item={seg.chainItem.get(c.id)}
          runs={c.runs}
          ms={seg.chainMs.get(c.id) ?? 0}
          k={chainKey(k, c.id)}
          depth={c.depth}
          feeds={c.feeds}
        />
      ))}
      <StepRow
        k={k}
        avoid={avoidKey(r)}
        goal={{ skill: route.goal.kind === 'level' ? route.goal.skill : r.skill }}
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
            {seg.fromStock && <span className="tag std">{t('flow.fromStock')}</span>}
            {chain.length > 0 && <span className="muted">{t('flow.withChain', { time: fmtDurationShort(seg.timeMs) })}</span>}
            {isNew && <span className="tag std">{t('flow.newAt', { level: r.level })}</span>}
            <Uses inputs={r.inputs} costs={r.costs} times={seg.actions} />
          </>
        }
        meta={
          <>
            <b>{fmtDurationShort(ownMs)}</b>
            <span className="bar">
              <span style={{ width: `${Math.max(3, share * 100)}%` }} />
            </span>
          </>
        }
      />
    </>
  )
  // Mit Vorstufen: alles in einem Kasten — Vorstufen in Herstell-Reihenfolge, der Abschnitt zuletzt
  return chain.length ? (
    <li className="seg-group">
      <ol className="steps">{rows}</ol>
    </li>
  ) : (
    rows
  )
}

/** Vorstufe eines Trainings-Abschnitts: Material beschaffen, eigener Schritt */
function ChainStep({ r, item, runs, ms, k, depth, feeds }: { r: Recipe; item?: Id; runs: number; ms: number; k: string; depth: number; feeds: Id[] }) {
  const { index, state } = useGame()
  const t = useT()
  const out = item ?? r.outputs[0]?.item
  const amount = out ? runs * yieldOf(r, out, state.profile) : runs
  const skill = r.skill ? index.skills.get(r.skill) : null
  return (
    <StepRow
      k={k}
      nested
      depth={depth}
      avoid={avoidKey(r)}
      goal={{ item: out }}
      icon={(out && index.items.get(out)?.icon) || r.icon}
      entity={out ? `item:${out}` : undefined}
      title={
        <>
          {fmtInt(Math.ceil(amount))}× {out ? <ItemName id={out} /> : r.name}
        </>
      }
      sub={
        <>
          {skill && <GameIcon src={skill.icon} size={14} entity={`skill:${skill.id}`} />}
          <SourceText r={r} self={out} />
          {feeds.length > 0 && (
            <span className="chain-for">
              <Sym name="chevron" size={9} />
              {t('flow.for')}{' '}
              {feeds.map((f, i) => (
                <Fragment key={f}>
                  {i > 0 && ', '}
                  <ItemName id={f} />
                </Fragment>
              ))}
            </span>
          )}
          <Uses inputs={r.inputs} costs={r.costs} times={runs} />
        </>
      }
      meta={<b>{ms > 0 ? fmtDurationShort(ms) : '—'}</b>}
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
      avoid={(index.producers.get(step.item) ?? []).filter((x) => !x.demoLocked).length > 1 || r.purchase ? avoidKey(r) : undefined}
      goal={{ item: step.item }}
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
          <Uses inputs={r.inputs} costs={r.costs} times={step.completions} />
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
  avoid,
  goal,
  nested,
  depth = 1,
}: {
  k: string
  icon: string | null | undefined
  title: React.ReactNode
  sub: React.ReactNode
  meta: React.ReactNode
  /** „item:<id>" — Tooltip und Kontextmenü */
  entity?: string
  /** Schlüssel zum Meiden dieses Wegs (Rezept oder Kauf) */
  avoid?: string
  /** Was der Schritt liefert — dazu passt „‹“ (vorige Alternative) */
  goal?: StepGoal
  /** Vorstufe eines anderen Schritts (eingerückt) */
  nested?: boolean
  /** wie tief in der Kette (1 = Zutat des Hauptschritts) — rückt weiter ein */
  depth?: number
}) {
  const { state, dispatch } = useGame()
  const t = useT()
  const alt = useAlternative(avoid, goal ?? {})
  const track = useContext(TrackContext)
  const done = !!state.done[k]
  const now = track?.current.has(k)
  const running = track?.live.has(k)
  const liveStep = running && track?.step?.key === k ? track.step : null
  return (
    <li
      className={`step ${done ? 'done' : ''} ${nested ? 'nested' : ''} ${now ? 'current' : ''} ${running ? 'running' : ''}`}
      style={nested && depth > 1 ? { marginLeft: 26 * depth } : undefined}
      data-entity={entity}
    >
      <button className="check" role="checkbox" aria-checked={done} aria-label={t('flow.markDone')} onClick={() => dispatch({ type: 'toggleDone', key: k })}>
        {done && <Sym name="check" size={12} />}
      </button>
      <GameIcon src={icon} size={26} entity={entity} />
      <div className="what">
        <b>{title}</b>
        <div className="sub">{sub}</div>
      </div>
      <div className="meta">
        {liveStep ? <LiveStepTime step={liveStep} planned={meta} /> : meta}
        <AltControl alt={alt} />
      </div>
    </li>
  )
}

/** Laufender Schritt: Restzeit aus der Messung, zählt zwischen den Spielständen
 *  herunter, mit Fortschritt; die geplante Zeit klein darunter */
function LiveStepTime({ step, planned }: { step: LiveStep; planned: React.ReactNode }) {
  const t = useT()
  const now = useNow(1000)
  if (!step.perMs)
    return (
      <>
        {planned}
        <span className="live-note">{t(step.measured ? 'track.noProgress' : 'track.measuring')}</span>
      </>
    )
  const left = liveRemaining(step, now)
  return (
    <>
      <b className="live-time" title={t('track.measuredHint')}>
        <i className="live-dot" /> {left > 0 ? fmtDurationShort(left) : t('track.stepReady')}
      </b>
      <span className="bar live-bar">
        <span style={{ width: `${Math.max(2, liveProgress(step, now) * 100)}%` }} />
      </span>
      <span className="live-note">
        {t(step.unit === 'xp' ? 'track.leftXp' : 'track.leftItems', { n: fmtInt(Math.ceil(liveAmount(step, now))) })} · {t('track.planned', { time: fmtDurationShort(step.planMs) })}
      </span>
    </>
  )
}

/** Was ein Schritt verbraucht: Symbol und Menge je Zutat */
function Uses({ inputs, costs = [], times }: { inputs: { item: Id; qty: number }[]; costs?: { currency: Id; qty: number }[]; times: number }) {
  const { index, state } = useGame()
  const t = useT()
  if ((!inputs.length && !costs.length) || times <= 0) return null
  return (
    <span className="uses" title={t('flow.usesHint')}>
      <span className="muted">{t('flow.uses')}</span>
      {costs.map((c) => (
        <Cost key={c.currency} currency={c.currency} qty={c.qty * times} />
      ))}
      {inputs.map((i) => (
        <span key={i.item}>
          <GameIcon src={index.items.get(i.item)?.icon} size={14} entity={`item:${i.item}`} /> {fmtInt(Math.ceil(i.qty * times))}
          {(state.reserved ?? []).includes(i.item) && <Sym name="lock" size={10} className="muted" />}
        </span>
      ))}
    </span>
  )
}

/** Münzen, die etwas kostet — rot, wenn sie gerade nicht reichen */
export function Cost({ currency, qty }: { currency: Id; qty: number }) {
  const { index, state } = useGame()
  const t = useT()
  const enough = (state.profile.currencies[currency] ?? 0) >= qty
  return (
    <span className={enough ? 'gold' : 'bad'} title={enough ? undefined : t('flow.notEnough', { have: fmtInt(state.profile.currencies[currency] ?? 0) })}>
      <GameIcon src={index.currencies.get(currency)?.icon} size={14} /> {fmtInt(Math.ceil(qty))}
    </span>
  )
}

/** Was der Abschnitt aus dem Lager nimmt — je Item zurücklegbar */
function StockUse({ used }: { used: Map<Id, number> }) {
  const { index, state, dispatch } = useGame()
  const t = useT()
  const list = [...used].filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1])
  if (!list.length) return null
  return (
    <div className="stock-use">
      <span className="su-label">{t('flow.fromStockUsed')}</span>
      {list.map(([id, n]) => (
        <span key={id} className="chip su-chip" data-entity={`item:${id}`}>
          <GameIcon src={index.items.get(id)?.icon} size={14} />
          {fmtInt(Math.ceil(n))}× {index.items.get(id)?.name ?? id}
          <span className="muted">{t('flow.ofStock', { n: fmtInt(state.profile.inventory[id] ?? 0) })}</span>
          <button className="chip-x" title={t('reserve.keepHint')} aria-label={t('reserve.keep')} onClick={() => dispatch({ type: 'reserve', item: id, reserved: true })}>
            <Sym name="lock" size={10} />
          </button>
        </span>
      ))}
    </div>
  )
}
