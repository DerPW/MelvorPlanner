// Kampf: Ausrüstung, Haltung, Zauber und Essen — und für jedes Monster, was
// ein Kill damit kostet und bringt (src/core/combat.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { combatLevel, enemyAreas, loadoutOf, perHour, playerFighter, simulate, stanceFor, type FightResult } from '../core/combat'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import type { CombatLoadout, Id, Item } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Ref, Segmented, Select, Sym, Toolbar } from './components'
import { useGame } from './state'

type Sort = 'xp' | 'gold' | 'time'

const ui = (name: string) => `game/icons/Icons/${name}.webp`
const pctText = (p: number) => `${fmtNum(Math.round(p * 1000) / 10)} %`

/** Ausrüstung ändern — schreibt in den Stand (die Live-Verbindung überschreibt es beim nächsten Speichern) */
export function useLoadout() {
  const { state, dispatch } = useGame()
  const loadout = loadoutOf(state.profile)
  const set = (patch: Partial<CombatLoadout>) => dispatch({ type: 'setCombat', loadout: { ...loadout, ...patch } })
  return { loadout, set }
}

export function CombatView() {
  const { index, state } = useGame()
  const { t } = useI18n()
  const [sort, setSort] = useState<Sort>('xp')
  const { loadout } = useLoadout()

  // Jedes Monster aus einem normalen Gebiet (Dungeon-Monster lassen keine Beute fallen)
  const rows = useMemo(() => {
    const seen = new Set<Id>()
    const list: { f: FightResult; area: string; h: ReturnType<typeof perHour> }[] = []
    for (const area of index.data.areas ?? []) {
      if (area.kind !== 'area') continue
      for (const id of area.enemies) {
        if (seen.has(id)) continue
        seen.add(id)
        const enemy = index.data.enemies?.find((e) => e.id === id)
        if (!enemy) continue
        const player = playerFighter(index, state.profile, loadout, enemyAreas(index, id).darkness)
        const f = simulate(index, player, enemy)
        list.push({ f, area: area.name, h: perHour(f) })
      }
    }
    const xp = (r: (typeof list)[number]) => Object.entries(r.h.xp).reduce((s, [k, v]) => (k === 'MelvorBase:Hitpoints' ? s : s + v), 0)
    return list.sort((a, b) =>
      sort === 'xp' ? xp(b) - xp(a) : sort === 'gold' ? b.h.gold + b.h.loot - (a.h.gold + a.h.loot) : a.f.killMs - b.f.killMs,
    )
  }, [index, state.profile, loadout, sort])

  return (
    <>
      <Toolbar title={t('combat.title')} subtitle={t('combat.subtitle')}>
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'xp', label: 'XP/h' },
            { value: 'gold', label: 'GP/h' },
            { value: 'time', label: t('combat.sortTime') },
          ]}
        />
      </Toolbar>
      <div className="content">
        <LoadoutPanel />
        <div className="group-title">
          {t('combat.monsters')} <span className="muted">{t('combat.monstersHint')}</span>
        </div>
        <table className="table combat-table">
          <thead>
            <tr>
              <th>{t('combat.monster')}</th>
              <th className="num">{t('combat.hit')}</th>
              <th className="num">{t('combat.kill')}</th>
              <th className="num">XP/h</th>
              <th className="num">GP/h</th>
              <th className="num hide-narrow">{t('combat.damageH')}</th>
              <th className="num hide-narrow">{t('combat.foodH')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, area, h }) => (
              <FightRow key={f.enemy.id} f={f} area={area} h={h} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FightRow({ f, area, h }: { f: FightResult; area: string; h: ReturnType<typeof perHour> }) {
  const { index, dispatch } = useGame()
  const { t } = useI18n()
  const xp = Object.entries(h.xp).filter(([k]) => k !== 'MelvorBase:Hitpoints')
  const total = xp.reduce((s, [, v]) => s + v, 0)
  return (
    <tr data-entity={`enemy:${f.enemy.id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'enemy', id: f.enemy.id } })}>
      <td>
        <div className="cell-item">
          <GameIcon src={f.enemy.icon} size={22} entity={`enemy:${f.enemy.id}`} />
          <span className="name">
            {f.enemy.name} <span className="muted">· {area}</span>
          </span>
          <DangerTag f={f} />
        </div>
      </td>
      <td className="num">{f.canAttack ? pctText(f.hitChance) : '—'}</td>
      <td className="num">{f.canAttack ? fmtDurationShort(f.killMs) : <span className="bad">{t('combat.cannot')}</span>}</td>
      <td className="num" title={xp.map(([k, v]) => `${index.skills.get(k)?.name}: ${fmtInt(v)}`).join('\n')}>
        {total ? fmtInt(total) : '—'}
      </td>
      <td className="num gold" title={t('combat.goldSplit', { gold: fmtInt(h.gold), loot: fmtInt(h.loot) })}>
        {h.gold + h.loot ? fmtInt(h.gold + h.loot) : '—'}
      </td>
      <td className="num hide-narrow">{h.damage ? fmtInt(h.damage) : '—'}</td>
      <td className="num hide-narrow">{f.player.food ? fmtNum(Math.round(h.food * 10) / 10) : <span className="muted">—</span>}</td>
    </tr>
  )
}

export function DangerTag({ f }: { f: FightResult }) {
  const { t } = useI18n()
  if (f.danger === 'safe') return null
  return (
    <span
      className={`tag ${f.danger === 'deadly' ? 'locked' : 'warn'}`}
      title={t(f.danger === 'deadly' ? 'combat.deadlyHint' : 'combat.riskyHint', { max: f.enemyMaxHit, eat: f.autoEatAt, hp: f.player.maxHp })}
    >
      {t(f.danger === 'deadly' ? 'combat.deadly' : 'combat.risky')}
    </span>
  )
}

/** Ausrüstung je Platz, Haltung, Zauber, Essen und die Werte daraus */
export function LoadoutPanel() {
  const { index, state } = useGame()
  const { t } = useI18n()
  const { loadout, set } = useLoadout()
  const player = playerFighter(index, state.profile, loadout)
  const c = index.data.combat
  const weapon = player.gear.Weapon ?? null
  const stance = stanceFor(index, loadout, weapon)
  const type = weapon?.weapon?.type ?? 'Melee'
  const stances = (c.weaponTypes[type] ?? []).map((id) => c.stances.find((s) => s.id === id)!).filter(Boolean)
  const foods = index.data.items.filter((i) => i.food).sort((a, b) => (state.profile.inventory[b.id] ?? 0) - (state.profile.inventory[a.id] ?? 0) || a.name.localeCompare(b.name))
  const spells = c.spells.filter((s) => !s.demoLocked)
  const level = combatLevel(player.style, player.levels)

  return (
    <div className="loadout">
      <div className="gear-grid">
        {c.slots.map((slot) => (
          <div key={slot.id} style={{ gridColumn: slot.x + 1, gridRow: slot.y + 1 }}>
            <SlotButton slot={slot} item={player.gear[slot.id] ?? null} occupiedBy={occupier(player.gear, slot.id)} />
          </div>
        ))}
      </div>
      <div className="loadout-side">
        <div className="form-group">
          <div className="form-row">
            <span className="grow">{t('combat.stance')}</span>
            <Segmented<string>
              value={stance.id}
              onChange={(id) => set({ stances: { ...loadout.stances, [type]: id } })}
              options={stances.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
          {player.style.spells && (
            <div className="form-row">
              <span className="grow">{t('combat.spell')}</span>
              <Select label={t('combat.spell')} value={loadout.spell ?? ''} onChange={(spell) => set({ spell: spell || null })}>
                <option value="">—</option>
                {spells.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.maxHit})
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="form-row">
            <span className="grow">{t('combat.food')}</span>
            <Select label={t('combat.food')} value={loadout.food ?? ''} onChange={(food) => set({ food: food || null })}>
              <option value="">—</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (+{f.food!.healing} HP{state.profile.inventory[f.id] ? ` · ${fmtInt(state.profile.inventory[f.id])}×` : ''})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="stat-grid compact">
          <Stat label={t('combat.level')} value={`${level} · ${player.style.name}`} />
          <Stat label="HP" value={fmtInt(player.maxHp)} />
          <Stat label={t('combat.accuracy')} value={fmtInt(player.accuracy)} />
          <Stat label={t('combat.maxHit')} value={fmtInt(player.baseMaxHit)} />
          <Stat label={t('combat.interval')} value={`${fmtNum(Math.round(player.intervalMs / 10) / 100)} s`} />
          <Stat label={t('combat.protection')} value={fmtInt(player.protection)} />
        </div>
        {player.problems.map((p, i) => (
          <p key={i} className="note bad">
            <Sym name="warn" size={13} /> {t(p)}
          </p>
        ))}
        <p className="muted small-note">{t('combat.notCounted')}</p>
      </div>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="stat">
    <span>{label}</span>
    <b>{value}</b>
  </div>
)

/** Welches Teil diesen Platz mitbelegt (Bogen → Offhand) */
function occupier(gear: Record<string, Item>, slot: string): Item | null {
  return Object.values(gear).find((i) => i.equipment?.occupies?.includes(slot)) ?? null
}

/** Ein Ausrüstungsplatz: Klick öffnet die Auswahl */
function SlotButton({ slot, item, occupiedBy }: { slot: { id: string; name: string; fits: string }; item: Item | null; occupiedBy: Item | null }) {
  const { t } = useI18n()
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const shown = item ?? occupiedBy
  return (
    <>
      <button
        ref={btn}
        className={`gear-slot ${shown ? 'filled' : ''} ${occupiedBy && !item ? 'occupied' : ''}`}
        data-entity={shown ? `item:${shown.id}` : undefined}
        title={shown ? undefined : slot.name}
        onClick={() => {
          const r = btn.current!.getBoundingClientRect()
          setAt(at ? null : { left: Math.min(r.left, window.innerWidth - 330), top: r.bottom + 6 })
        }}
      >
        {shown ? <GameIcon src={shown.icon} size={34} /> : <span className="slot-name">{t(`slot.${slot.id}`)}</span>}
      </button>
      {at && <SlotPicker slot={slot} at={at} onClose={() => setAt(null)} />}
    </>
  )
}

function SlotPicker({ slot, at, onClose }: { slot: { id: string; name: string; fits: string }; at: { left: number; top: number }; onClose: () => void }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const { loadout, set } = useLoadout()
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    setTimeout(() => document.addEventListener('mousedown', close))
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  const inv = state.profile.inventory
  const list = index.data.items
    .filter((i) => i.equipment?.type === slot.fits && i.id !== 'MelvorBase:DefaultWeapon' && i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number((inv[b.id] ?? 0) > 0) - Number((inv[a.id] ?? 0) > 0) || reqLevel(a) - reqLevel(b) || a.name.localeCompare(b.name))
  const pick = (id: Id | null) => {
    const gear = { ...loadout.gear }
    if (id) gear[slot.id] = id
    else delete gear[slot.id]
    set({ gear })
    onClose()
  }
  return createPortal(
    <div ref={box} className="popover floating slot-picker" style={{ left: at.left, top: at.top, width: 320 }}>
      <div className="search">
        <Sym name="search" size={15} className="sym-lead" />
        <input autoFocus value={q} placeholder={t(`slot.${slot.id}`)} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="pop-row" onClick={() => pick(null)}>
        <span className="grow muted">{t('combat.emptySlot')}</span>
      </button>
      {list.map((i) => (
        <button key={i.id} className={`pop-row ${loadout.gear[slot.id] === i.id ? 'active' : ''}`} data-entity={`item:${i.id}`} onClick={() => pick(i.id)}>
          <GameIcon src={i.icon} size={22} />
          <span className="grow">{i.name}</span>
          {reqLevel(i) > 1 && <span className="muted">Lv {reqLevel(i)}</span>}
          {(inv[i.id] ?? 0) > 0 && <span className="badge">{fmtInt(inv[i.id])}</span>}
        </button>
      ))}
    </div>,
    document.body,
  )
}

const reqLevel = (i: Item) => Math.max(1, ...(i.equipment?.reqs ?? []).map((q) => (q.type === 'level' ? q.level : 1)))

/** Simulation auf der Monster-Detailseite: mit deiner Ausrüstung und jeder Haltung der Waffe */
export function EnemyFight({ id }: { id: Id }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const { loadout } = useLoadout()
  const enemy = index.data.enemies?.find((e) => e.id === id)
  if (!enemy) return null
  const darkness = enemyAreas(index, id).darkness
  const player = playerFighter(index, state.profile, loadout, darkness)
  const f = simulate(index, player, enemy)
  const h = perHour(f)
  const weapon = player.gear.Weapon ?? null
  const type = weapon?.weapon?.type ?? 'Melee'
  const others = (index.data.combat.weaponTypes[type] ?? []).map((s) => {
    const p = playerFighter(index, state.profile, { ...loadout, stances: { ...loadout.stances, [type]: s } }, darkness)
    const r = simulate(index, p, enemy)
    return { stance: p.stance, r, h: perHour(r) }
  })
  return (
    <>
      <div className="stat-grid">
        <Stat label={t('combat.hit')} value={f.canAttack ? pctText(f.hitChance) : '—'} />
        <Stat label={t('combat.maxHit')} value={`${f.minHit}–${f.maxHit}`} />
        <Stat label={t('combat.turns')} value={f.canAttack ? fmtNum(Math.round(f.turnsPerKill * 10) / 10) : '—'} />
        <Stat label={t('combat.kill')} value={f.canAttack ? fmtDurationShort(f.killMs) : t('combat.cannot')} />
        <Stat label={t('combat.killsH')} value={fmtNum(Math.round(h.kills * 10) / 10)} />
        <Stat label="GP/h" value={fmtInt(h.gold + h.loot)} />
        <Stat label={t('combat.enemyHit')} value={pctText(f.enemyHitChance)} />
        <Stat label={t('combat.enemyMax')} value={fmtInt(f.enemyMaxHit)} />
        <Stat label={t('combat.damageH')} value={fmtInt(h.damage)} />
        <Stat label={t('combat.foodH')} value={player.food ? fmtNum(Math.round(h.food * 10) / 10) : '—'} />
        {Object.entries(h.xp).map(([k, v]) => (
          <Stat key={k} label={`XP/h ${index.skills.get(k)?.name ?? k}`} value={fmtInt(v)} />
        ))}
      </div>
      <DangerTag f={f} />
      {player.problems.map((p, i) => (
        <p key={i} className="note bad">
          <Sym name="warn" size={13} /> {t(p)}
        </p>
      ))}
      {others.length > 1 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('combat.stance')}</th>
              <th className="num">{t('combat.kill')}</th>
              <th className="num">XP/h</th>
            </tr>
          </thead>
          <tbody>
            {others.map(({ stance, r, h }) => (
              <tr key={stance.id} className={`static ${stance.id === f.player.stance.id ? 'selected-soft' : ''}`}>
                <td>
                  <div className="cell-item">
                    <span className="name">{stance.name}</span>
                    <span className="muted">
                      {stance.xp
                        .filter((g) => g.skill !== 'MelvorBase:Hitpoints')
                        .map((g) => index.skills.get(g.skill)?.name)
                        .join(' + ')}
                    </span>
                  </div>
                </td>
                <td className="num">{r.canAttack ? fmtDurationShort(r.killMs) : '—'}</td>
                <td className="num">
                  {fmtInt(Object.entries(h.xp).reduce((s, [k, v]) => (k === 'MelvorBase:Hitpoints' ? s : s + v), 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-note">
        {t('combat.withLoadout')} <Ref entity={weapon ? `item:${weapon.id}` : null}>{weapon?.name ?? t('combat.fists')}</Ref>
        {darkness > 0 ? ` · ${t('combat.darkness', { n: darkness })}` : ''}
      </p>
    </>
  )
}

export const COMBAT_ICON = ui('Combat')
