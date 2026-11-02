// Ausrüstungs-Vergleich: jedes passende Teil je Platz gegen die jetzige
// Ausrüstung gerechnet, an einem Zielmonster — was bringt welches Upgrade?

import { useMemo, useState } from 'react'
import { enemyAreas, playerFighter, simulate, type FightResult } from '../core/combat'
import { fmtDurationShort, fmtInt } from '../core/format'
import { unmetReqs } from '../core/planner'
import type { CombatLoadout, Enemy, Item } from '../core/types'
import { useI18n } from '../i18n'
import { DangerTag, LoadoutPanel, useLoadout } from './CombatView'
import { GameIcon, Ref, Segmented, Select, TabPills, Toolbar } from './components'
import { better, CompareAB, fmtMetric, metricOf, OptimalGear, xpRate, type Metric } from './GearTools'
import { Needs } from './SolutionView'
import { useGame, type GearTab } from './state'
import { SkillGear } from './SkillGear'

interface Option {
  item: Item | null
  slot: string
  f: FightResult
  value: number
  delta: number
  reqsMet: boolean
}

export function GearView() {
  const { index, state, dispatch } = useGame()
  const tab: GearTab = state.gearTab ?? 'compare'
  const { t } = useI18n()
  const { loadout } = useLoadout()
  const [metric, setMetric] = useState<Metric>('xp')
  const enemies = useMemo(() => {
    const ids = new Set((index.data.areas ?? []).filter((a) => a.kind === 'area').flatMap((a) => a.enemies))
    return (index.data.enemies ?? []).filter((e) => ids.has(e.id))
  }, [index])
  // Vorwahl: das Monster mit den meisten Kampf-XP für die jetzige Ausrüstung
  const best = useMemo(() => {
    let top: { e: Enemy; v: number } | null = null
    for (const e of enemies) {
      const f = simulate(index, playerFighter(index, state.profile, loadout, enemyAreas(index, e.id).darkness), e)
      const v = f.danger === 'safe' ? xpRate(f) : 0
      if (!top || v > top.v) top = { e, v }
    }
    return top?.e.id ?? enemies[0]?.id
  }, [index, state.profile, loadout, enemies])
  const chosen = state.gearTarget ?? null
  const target = enemies.find((e) => e.id === (chosen ?? best)) ?? enemies[0]

  const result = useMemo(() => (target && tab === 'upgrades' ? compare(index, state.profile, loadout, target, metric) : null), [index, state.profile, loadout, target, metric, tab])

  return (
    <>
      <Toolbar title={t('gear.title')} subtitle={t(tab === 'compare' ? 'gear.subCompare' : tab === 'optimal' ? 'gear.subOptimal' : tab === 'skills' ? 'gear.subSkills' : 'gear.subtitle')}>
        {tab !== 'skills' && (
          <Segmented<Metric>
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'xp', label: 'XP/h' },
              { value: 'time', label: t('combat.kill') },
              { value: 'gold', label: 'GP/h' },
              { value: 'damage', label: t('combat.damageH') },
            ]}
          />
        )}
      </Toolbar>
      <div className="content">
        <TabPills<GearTab>
          value={tab}
          onChange={(tab) => dispatch({ type: 'gearTab', tab })}
          options={[
            { value: 'compare', label: t('gear.tabCompare') },
            { value: 'upgrades', label: t('gear.tabUpgrades') },
            { value: 'optimal', label: t('gear.tabOptimal') },
            { value: 'skills', label: t('gear.tabSkills') },
          ]}
        />
        {tab === 'skills' && <SkillGear />}
        {tab === 'upgrades' && <LoadoutPanel />}
        {tab !== 'skills' && (
          <div className="gear-target">
            <span className="muted">{t('gear.against')}</span>
            <Select label={t('gear.against')} value={target?.id ?? ''} onChange={(id) => dispatch({ type: 'gearTarget', enemy: id })}>
              {[...enemies]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.id === best ? ` — ${t('gear.bestXp')}` : ''}
                  </option>
                ))}
            </Select>
            {target && (
              <span className="gear-now">
                <GameIcon src={target.icon} size={20} entity={`enemy:${target.id}`} />
                {result && (
                  <span className="muted">
                    {t('gear.now', {
                      value: fmtMetric(metric, result.base.value),
                    })}
                  </span>
                )}
                {result && <DangerTag f={result.base.f} />}
              </span>
            )}
          </div>
        )}

        {tab === 'compare' && target && <CompareAB enemy={target} metric={metric} />}
        {tab === 'optimal' && target && <OptimalGear enemy={target} metric={metric} />}
        {tab === 'upgrades' && result && (
          <>
            <div className="group-title">
              {t('gear.top')} <span className="muted">{t('gear.topHint')}</span>
            </div>
            {result.top.length ? (
              <OptionTable rows={result.top} metric={metric} showSlot />
            ) : (
              <p className="muted">{t('gear.noBetter')}</p>
            )}
            {result.slots.map((s) => (
              <SlotSection key={s.slot.id} slot={s.slot} current={s.current} rows={s.rows} metric={metric} />
            ))}
          </>
        )}
      </div>
    </>
  )
}

function fmtDelta(m: Metric, d: number, t: (k: string) => string) {
  if (!Number.isFinite(d)) return t(d * better(m) > 0 ? 'gear.nowPossible' : 'combat.cannot')
  if (Math.abs(d) < 0.5) return '±0'
  const sign = d > 0 ? '+' : '−'
  return m === 'time' ? `${sign}${fmtDurationShort(Math.abs(d))}` : `${sign}${fmtInt(Math.abs(d))}`
}

/** Jedes Teil eines Platzes eingesetzt; bei Waffen die beste Haltung für die Kennzahl */
function compare(index: ReturnType<typeof useGame>['index'], profile: ReturnType<typeof useGame>['state']['profile'], loadout: CombatLoadout, enemy: Enemy, metric: Metric) {
  const darkness = enemyAreas(index, enemy.id).darkness
  const run = (lo: CombatLoadout) => simulate(index, playerFighter(index, profile, lo, darkness), enemy)
  const baseF = run(loadout)
  const base = { f: baseF, value: metricOf(baseF, metric) }
  const dir = better(metric)
  const slots = index.data.combat.slots.map((slot) => {
    const current = loadout.gear[slot.id] ? (index.items.get(loadout.gear[slot.id]) ?? null) : null
    const candidates = index.data.items.filter((i) => i.equipment?.type === slot.fits && i.id !== 'MelvorBase:DefaultWeapon' && i.id !== current?.id)
    const rows: Option[] = []
    for (const item of [null, ...candidates]) {
      if (item === null && !current) continue
      const gear = { ...loadout.gear }
      if (item) gear[slot.id] = item.id
      else delete gear[slot.id]
      let f = run({ ...loadout, gear })
      // Neue Waffe: jede ihrer Haltungen probieren
      if (slot.id === 'Weapon' && item?.weapon) {
        for (const st of index.data.combat.weaponTypes[item.weapon.type] ?? []) {
          const g = run({ ...loadout, gear, stances: { ...loadout.stances, [item.weapon.type]: st } })
          if (dir * (metricOf(g, metric) - metricOf(f, metric)) > 0) f = g
        }
      }
      const value = metricOf(f, metric)
      // Unendlich (kein Angriff möglich) minus unendlich zählt als gleich
      const delta = Number.isNaN(value - base.value) ? 0 : value - base.value
      rows.push({ item, slot: slot.id, f, value, delta, reqsMet: !item || unmetReqs(item.equipment?.reqs ?? [], profile).length === 0 })
    }
    rows.sort((a, b) => dir * (b.delta - a.delta))
    return { slot, current, rows }
  })
  // Beste Upgrades über alle Plätze: sicher, besser, erst die tragbaren
  const top = slots
    .flatMap((s) => s.rows.filter((r) => r.item && dir * r.delta > 0.5 && r.f.danger === 'safe'))
    .sort((a, b) => Number(b.reqsMet) - Number(a.reqsMet) || dir * (b.delta - a.delta))
    .slice(0, 10)
  return { base, slots, top }
}

function OptionTable({ rows, metric, showSlot }: { rows: Option[]; metric: Metric; showSlot?: boolean }) {
  const { state } = useGame()
  const { t } = useI18n()
  const profile = state.profile
  const dir = better(metric)
  return (
    <table className="table gear-table">
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.slot}:${r.item?.id ?? '-'}`} className={`${r.reqsMet ? '' : 'dim'} static`} data-entity={r.item ? `item:${r.item.id}` : undefined}>
            <td>
              <div className="cell-item">
                {r.item ? <GameIcon src={r.item.icon} size={22} entity={`item:${r.item.id}`} /> : <span className="gi-empty" />}
                <span className="name">
                  {r.item ? <Ref entity={`item:${r.item.id}`}>{r.item.name}</Ref> : t('combat.emptySlot')}
                  {showSlot && <span className="muted"> · {t(`slot.${r.slot}`)}</span>}
                </span>
                {!r.reqsMet && r.item && <Needs reqs={unmetReqs(r.item.equipment?.reqs ?? [], profile)} />}
                {r.item && (profile.inventory[r.item.id] ?? 0) > 0 && <span className="badge">{t('gear.owned')}</span>}
                <DangerTag f={r.f} />
              </div>
            </td>
            <td className={`num delta ${dir * r.delta > 0.5 ? 'up' : dir * r.delta < -0.5 ? 'down' : ''}`}>{fmtDelta(metric, r.delta, t)}</td>
            <td className="num hide-narrow">{fmtMetric(metric, r.value)}</td>
            <td className="num hide-narrow muted">{r.f.canAttack ? fmtDurationShort(r.f.killMs) : t('combat.cannot')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SlotSection({ slot, current, rows, metric }: { slot: { id: string; name: string }; current: Item | null; rows: Option[]; metric: Metric }) {
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  const dir = better(metric)
  const shown = all ? rows : rows.filter((r) => dir * r.delta > 0.5).slice(0, 5)
  return (
    <section className="gear-slot-section">
      <div className="group-title">
        {t(`slot.${slot.id}`)}
        <span className="muted">
          {current ? (
            <>
              {t('gear.current')} <Ref entity={`item:${current.id}`}>{current.name}</Ref>
            </>
          ) : (
            t('gear.empty')
          )}
        </span>
        <span className="spacer" />
        {rows.length > 0 && (
          <button className="btn plain small" onClick={() => setAll(!all)}>
            {all ? t('gear.onlyBetter') : t('gear.showAll', { n: rows.length })}
          </button>
        )}
      </div>
      {shown.length ? <OptionTable rows={shown} metric={metric} /> : <p className="muted small-note">{t('gear.nothingBetter')}</p>}
    </section>
  )
}
