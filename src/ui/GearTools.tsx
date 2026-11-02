// Ausrüstung: zwei Teile nebeneinander (A/B) und die beste Kombination gegen
// ein Monster — wahlweise nur aus dem Lager, nur tragbar oder alles.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { enemyAreas, perHour, playerFighter, simulate, type FightResult } from '../core/combat'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { better, metricOf, optimize, slotFor, withItem, xpRate, type Metric, type Optimum, type Scope } from '../core/gear'
import { unmetReqs } from '../core/planner'
import type { Enemy, Id, Item } from '../core/types'

export { better, metricOf, xpRate, type Metric }
import { useI18n, type T } from '../i18n'
import { DangerTag, useLoadout } from './CombatView'
import { GameIcon, Ref, Sym, TabPills } from './components'
import { Needs } from './SolutionView'
import { planItem, useGame } from './state'

export function fmtMetric(m: Metric, v: number) {
  if (!Number.isFinite(v)) return '—'
  return m === 'time' ? fmtDurationShort(v) : `${fmtInt(v)}${m === 'xp' ? ' XP/h' : m === 'gold' ? ' GP/h' : '/h'}`
}

// ---------------------------------------------------------------- A/B

/** Werte, bei denen weniger besser ist */
const LOWER_IS_BETTER = new Set(['AttackInterval'])

export function CompareAB({ enemy, metric }: { enemy: Enemy; metric: Metric }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const { loadout } = useLoadout()
  const { a: aId, b: bId } = state.compare ?? { a: null, b: null }
  const a = aId ? (index.items.get(aId) ?? null) : null
  const b = bId ? (index.items.get(bId) ?? null) : null
  // Ohne Wahl: A = jetzige Waffe
  useEffect(() => {
    if (!aId && loadout.gear.Weapon) dispatch({ type: 'setCompare', a: loadout.gear.Weapon })
  }, [aId, loadout.gear.Weapon, dispatch])

  const rows = useMemo(() => {
    const names = new Set<string>()
    for (const it of [a, b]) for (const s of it?.equipment?.stats ?? []) names.add(s.name)
    // Ohne Teil gibt es keinen Wert („—“), nicht 0
    const val = (it: Item | null, n: string) => (it ? (it.equipment?.stats.find((s) => s.name === n)?.value ?? 0) : null)
    return [...names].map((n) => ({ name: n, a: val(a, n), b: val(b, n), lower: LOWER_IS_BETTER.has(n) }))
  }, [a, b])
  const power = (it: Item | null, kind: 'power' | 'protection') => (it ? (it.equipment?.[kind].find((p) => p.name === 'Normal')?.value ?? 0) : null)
  const fa = useMemo(() => (a ? withItem(index, state.profile, loadout, a, enemy, metric) : null), [index, state.profile, loadout, a, enemy, metric])
  const fb = useMemo(() => (b ? withItem(index, state.profile, loadout, b, enemy, metric) : null), [index, state.profile, loadout, b, enemy, metric])

  const fight = (f: FightResult | null) => {
    if (!f) return null
    const h = perHour(f)
    return { hit: f.hitChance, max: f.maxHit, kill: f.killMs, xp: xpRate(f), gold: h.gold + h.loot, dmg: h.damage }
  }
  const A = fight(fa)
  const B = fight(fb)

  return (
    <>
      <div className="ab-pickers">
        <PickButton label="A" item={a} other={b} onPick={(id) => dispatch({ type: 'setCompare', a: id })} />
        <button className="icon-btn" title={t('gear.swap')} aria-label={t('gear.swap')} onClick={() => dispatch({ type: 'setCompare', a: bId, b: aId })}>
          ⇄
        </button>
        <PickButton label="B" item={b} other={a} onPick={(id) => dispatch({ type: 'setCompare', b: id })} />
      </div>
      {a && b && a.equipment?.type !== b.equipment?.type && <p className="note">{t('gear.diffSlots')}</p>}

      <table className="table ab-table">
        <thead>
          <tr>
            <th />
            <th className="num">A</th>
            <th className="num">B</th>
            <th className="num">{t('gear.diff')}</th>
          </tr>
        </thead>
        <tbody>
          <AbRow label={t('gear.slot')} a={a ? t(`slot.${slotFor(index, a) ?? 'Weapon'}`) : '—'} b={b ? t(`slot.${slotFor(index, b) ?? 'Weapon'}`) : '—'} />
          {rows.map((r) => (
            <AbNum key={r.name} label={statLabel(t, r.name)} a={r.a} b={r.b} lower={r.lower} unit={r.name === 'AttackInterval' ? 's' : ''} scale={r.name === 'AttackInterval' ? 0.001 : 1} />
          ))}
          <AbNum label={t('gear.power')} a={power(a, 'power')} b={power(b, 'power')} />
          <AbNum label={t('combat.protection')} a={power(a, 'protection')} b={power(b, 'protection')} />
          <tr className="static">
            <td>{t('gear.needs')}</td>
            <td className="num">{a ? <ReqCell item={a} /> : '—'}</td>
            <td className="num">{b ? <ReqCell item={b} /> : '—'}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div className="group-title">
        {t('gear.inFight')}{' '}
        <span className="muted">
          <GameIcon src={enemy.icon} size={16} entity={`enemy:${enemy.id}`} /> {enemy.name} · {t('gear.restSame')}
        </span>
      </div>
      <table className="table ab-table">
        <tbody>
          <AbNum label={t('combat.hit')} a={A?.hit ?? null} b={B?.hit ?? null} pct />
          <AbNum label={t('combat.maxHit')} a={A?.max ?? null} b={B?.max ?? null} />
          <AbNum label={t('combat.kill')} a={A?.kill ?? null} b={B?.kill ?? null} lower time />
          <AbNum label="XP/h" a={A?.xp ?? null} b={B?.xp ?? null} />
          <AbNum label="GP/h" a={A?.gold ?? null} b={B?.gold ?? null} />
          <AbNum label={t('combat.damageH')} a={A?.dmg ?? null} b={B?.dmg ?? null} lower />
          <tr className="static">
            <td />
            <td className="num">{fa && <DangerTag f={fa} />}</td>
            <td className="num">{fb && <DangerTag f={fb} />}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="muted small-note">{t('gear.abHint', { metric: metric === 'xp' ? 'XP/h' : metric === 'gold' ? 'GP/h' : t(metric === 'time' ? 'combat.kill' : 'combat.damageH') })}</p>
    </>
  )
}

function statLabel(t: T, name: string) {
  const k = `cstat.${name}`
  return t(k) === k ? name.replace(/([a-z])([A-Z])/g, '$1 $2') : t(k)
}

function AbRow({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <tr className="static">
      <td>{label}</td>
      <td className="num">{a}</td>
      <td className="num">{b}</td>
      <td />
    </tr>
  )
}

/** Zahl je Seite und Differenz B − A, grün wenn B besser ist */
function AbNum({ label, a, b, lower, unit = '', scale = 1, pct, time }: { label: string; a: number | null; b: number | null; lower?: boolean; unit?: string; scale?: number; pct?: boolean; time?: boolean }) {
  const f = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return '—'
    if (pct) return `${fmtNum(Math.round(v * 1000) / 10)} %`
    if (time) return fmtDurationShort(v)
    return `${fmtNum(Math.round(v * scale * 100) / 100)}${unit ? ` ${unit}` : ''}`
  }
  const d = a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b) ? b - a : null
  const good = d !== null && Math.abs(d) > 1e-9 ? (lower ? d < 0 : d > 0) : null
  return (
    <tr className="static">
      <td>{label}</td>
      <td className="num">{f(a)}</td>
      <td className="num">{f(b)}</td>
      <td className={`num delta ${good === true ? 'up' : good === false ? 'down' : ''}`}>
        {d === null ? '' : Math.abs(d) < 1e-9 ? '±0' : `${d > 0 ? '+' : '−'}${pct ? `${fmtNum(Math.round(Math.abs(d) * 1000) / 10)} %` : time ? fmtDurationShort(Math.abs(d)) : fmtNum(Math.round(Math.abs(d) * scale * 100) / 100)}`}
      </td>
    </tr>
  )
}

function ReqCell({ item }: { item: Item }) {
  const { state } = useGame()
  const { t } = useI18n()
  const unmet = unmetReqs(item.equipment?.reqs ?? [], state.profile)
  return unmet.length ? <Needs reqs={unmet} /> : <span className="ok">{t('gear.wearable')}</span>
}

/** Knopf mit Auswahlliste aller Ausrüstungsteile (gleicher Platz wie das andere zuerst) */
function PickButton({ label, item, other, onPick }: { label: string; item: Item | null; other: Item | null; onPick: (id: Id) => void }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!at) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setAt(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [at])
  const inv = state.profile.inventory
  const type = other?.equipment?.type
  const list = index.data.items
    .filter((i) => i.equipment && i.id !== 'MelvorBase:DefaultWeapon' && i.name.toLowerCase().includes(q.toLowerCase()))
    .sort(
      (x, y) =>
        Number(y.equipment?.type === type) - Number(x.equipment?.type === type) ||
        Number((inv[y.id] ?? 0) > 0) - Number((inv[x.id] ?? 0) > 0) ||
        x.name.localeCompare(y.name),
    )
    .slice(0, 120)
  return (
    <>
      <button
        ref={btn}
        className={`ab-pick ${item ? '' : 'ab-unset'}`}
        data-entity={item ? `item:${item.id}` : undefined}
        onClick={() => {
          const r = btn.current!.getBoundingClientRect()
          setAt(at ? null : { left: Math.min(r.left, window.innerWidth - 330), top: r.bottom + 6 })
        }}
      >
        <span className="ab-label">{label}</span>
        {item ? <GameIcon src={item.icon} size={30} /> : <span className="gi-empty" />}
        <span className="ab-name">{item?.name ?? t('gear.pick')}</span>
        <Sym name="chevron" size={10} className="rot" />
      </button>
      {at &&
        createPortal(
          <div ref={box} className="popover floating slot-picker" style={{ left: at.left, top: at.top, width: 320 }}>
            <div className="search">
              <Sym name="search" size={15} className="sym-lead" />
              <input autoFocus value={q} placeholder={t('gear.pick')} onChange={(e) => setQ(e.target.value)} />
            </div>
            {list.map((i) => (
              <button
                key={i.id}
                className={`pop-row ${item?.id === i.id ? 'active' : ''}`}
                data-entity={`item:${i.id}`}
                onClick={() => {
                  onPick(i.id)
                  setAt(null)
                }}
              >
                <GameIcon src={i.icon} size={22} />
                <span className="grow">{i.name}</span>
                <span className="muted">{t(`slot.${index.data.combat.slots.find((s) => s.fits === i.equipment?.type)?.id ?? 'Weapon'}`)}</span>
                {(inv[i.id] ?? 0) > 0 && <span className="badge">{fmtInt(inv[i.id])}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// ---------------------------------------------------------------- Optimal

export function OptimalGear({ enemy, metric }: { enemy: Enemy; metric: Metric }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const { loadout, set } = useLoadout()
  const [scope, setScope] = useState<Scope>('owned')
  const [result, setResult] = useState<Optimum | null>(null)
  const [busy, setBusy] = useState(false)
  const current = useMemo(() => simulate(index, playerFighter(index, state.profile, loadout, enemyAreas(index, enemy.id).darkness), enemy), [index, state.profile, loadout, enemy])

  // Rechnen kostet ein paar tausend Simulationen — erst zeichnen, dann rechnen
  useEffect(() => {
    setBusy(true)
    const id = setTimeout(() => {
      setResult(optimize(index, state.profile, loadout, enemy, metric, scope))
      setBusy(false)
    }, 30)
    return () => clearTimeout(id)
  }, [index, state.profile, loadout, enemy, metric, scope])

  const now = metricOf(current, metric)
  const missing = result?.picks.filter((p) => p.item && !p.owned) ?? []
  return (
    <>
      <div className="opt-controls">
        <TabPills<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'owned', label: t('gear.scopeOwned') },
            { value: 'wearable', label: t('gear.scopeWearable') },
            { value: 'all', label: t('gear.scopeAll') },
          ]}
        />
        {busy && <span className="muted">{t('gear.computing')}</span>}
      </div>
      {result && (
        <div className={`opt-result ${busy ? 'stale' : ''}`}>
          <div className="opt-head">
            <div>
              <span className="muted">{t('gear.optValue')}</span>
              <b>{fmtMetric(metric, result.value)}</b>
              <span className={`delta ${better(metric) * (result.value - now) > 0.5 ? 'up' : ''}`}>
                {t('gear.vsNow', { now: fmtMetric(metric, now) })}
              </span>
            </div>
            <DangerTag f={result.f} />
            <span className="spacer" />
            {missing.length > 0 && (
              <button className="btn small plain" onClick={() => missing.forEach((m) => m.item && dispatch(planItem(m.item.id)))}>
                {t('gear.planMissing', { n: missing.length })}
              </button>
            )}
            <button className="btn small primary" onClick={() => set({ gear: result.loadout.gear, stances: result.loadout.stances })}>
              {t('gear.apply')}
            </button>
          </div>
          <table className="table gear-table">
            <tbody>
              {result.picks
                .filter((p) => p.item || loadout.gear[p.slot])
                .map((p) => (
                  <tr key={p.slot} className="static" data-entity={p.item ? `item:${p.item.id}` : undefined}>
                    <td className="muted" style={{ width: 110 }}>
                      {t(`slot.${p.slot}`)}
                    </td>
                    <td>
                      <div className="cell-item">
                        {p.item ? <GameIcon src={p.item.icon} size={22} entity={`item:${p.item.id}`} /> : <span className="gi-empty" />}
                        <span className="name">{p.item ? <Ref entity={`item:${p.item.id}`}>{p.item.name}</Ref> : t('combat.emptySlot')}</span>
                        {p.item && loadout.gear[p.slot] === p.item.id && <span className="badge">{t('gear.same')}</span>}
                        {p.item && !p.wearable && <Needs reqs={unmetReqs(p.item.equipment?.reqs ?? [], state.profile)} />}
                      </div>
                    </td>
                    <td className="num">
                      {p.item && !p.owned ? (
                        <span className="opt-missing">
                          {p.alternative ? (
                            <span className="muted">
                              {t('gear.alt')} <Ref entity={`item:${p.alternative.id}`}>{p.alternative.name}</Ref>
                            </span>
                          ) : null}
                          <button className="btn small" onClick={() => dispatch(planItem(p.item!.id))}>
                            {t('shop.plan')}
                          </button>
                        </span>
                      ) : p.item ? (
                        <span className="ok">{t('gear.owned')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted small-note">{t('gear.optHint')}</p>
        </div>
      )}
    </>
  )
}
