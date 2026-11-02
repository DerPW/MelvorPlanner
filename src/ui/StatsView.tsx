// Statistiken wie im Spiel (Kopf-Knopf „Statistics“): je Einheit die Werte in
// Spielreihenfolge, dann je Währung, dazu — was das Spiel-Menü nicht zeigt —
// die Items, die gewonnen, verbraucht, gefunden … wurden. Ohne Einheit eine
// Übersicht. Summen und Gesamtwerte rechnet das Spiel beim Laden aus, wir auch.

import { useState } from 'react'
import { fmtDuration, fmtInt } from '../core/format'
import { STAT_DEFS, STAT_LABELS, type StatDef } from '../core/statDefs'
import type { GameIndex } from '../core/planner'
import type { Id, Profile } from '../core/types'
import { useI18n, type T } from '../i18n'
import { GameIcon, Toolbar } from './components'
import { useGame } from './state'

const ui = (name: string) => `game/icons/Icons/${name}.webp`
const short = (id: string) => id.replace(/^MelvorBase:/, '')
/** .NET-Ticks (seit 0001) → Millisekunden seit 1970 */
const ticksToMs = (ticks: number) => (ticks - 621_355_968_000_000_000) / 10_000

const ORDER = ['MelvorBase:CharacterStatistics', 'MelvorBase:Bank', 'MelvorBase:Shop', 'MelvorBase:Combat', 'MelvorBase:Slayer', 'MelvorBase:Quests']

/** Name einer Einheit: Bereiche mit eigenem Namen in der App (Bank, Shop, Kampf, Quests), Skills wie im Spiel */
export function entityName(index: GameIndex, t: T, entity: Id): string {
  const own: Record<Id, string> = {
    'MelvorBase:CharacterStatistics': t('stats.character'),
    'MelvorBase:Bank': t('bank.title'),
    'MelvorBase:Shop': t('shop.title'),
    'MelvorBase:Combat': t('combat.title'),
    'MelvorBase:Quests': t('quests.title'),
  }
  return own[entity] ?? index.skills.get(entity)?.name ?? index.data.entityNames?.[entity] ?? short(entity).replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function useEntityName() {
  const { index } = useGame()
  const { t } = useI18n()
  return (entity: Id) => entityName(index, t, entity)
}

export function entityIcon(index: GameIndex, entity: Id): string {
  if (entity === 'MelvorBase:CharacterStatistics') return ui('Milestones')
  return index.skills.get(entity)?.icon ?? ui(short(entity))
}

/** Wert einer Statistik aus dem Stand: gespeichert, als Summe oder berechnet; null = unbekannt */
function statValue(profile: Profile, id: Id, def: StatDef, extra: { questsDone: number; stepsDone: number }): number | null {
  const [, kind, , , sum] = def
  if (kind === 'simple') return profile.values?.[id] ?? null
  if (kind === 'sum') {
    const map = profile.stats?.[`MelvorBase:${sum}`]
    return map ? Object.values(map).reduce((a, b) => a + b, 0) : profile.stats ? 0 : null
  }
  if (kind === 'other') {
    switch (short(id)) {
      case 'TotalSkillLevel':
        return Object.values(profile.levels).reduce((a, b) => a + b, 0)
      case 'TotalSkillExperience':
        return Object.values(profile.xp ?? {}).reduce((a, b) => a + b, 0)
      case 'CharacterAge': {
        const created = profile.values?.['MelvorBase:CharacterCreationDate']
        return created ? Date.now() - ticksToMs(created) : null
      }
      case 'QuestsCompleted':
        return profile.quests ? extra.questsDone : null
      case 'QuestStepsCompleted':
        return profile.quests ? extra.stepsDone : null
    }
  }
  return null
}

export function StatsView({ entity }: { entity?: Id }) {
  const { index } = useGame()
  const { t } = useI18n()
  const name = useEntityName()
  return (
    <>
      <Toolbar title={entity ? `${name(entity)} · ${t('stats.title')}` : t('stats.title')} subtitle={t('stats.subtitle')} />
      <div className="content narrow-content">{entity && index.data.statistics?.[entity] ? <EntityStats entity={entity} /> : <StatsOverview />}</div>
    </>
  )
}

function useFormat() {
  const { locale, t } = useI18n()
  return (def: StatDef, v: number | null) => {
    if (v === null) return '—'
    if (def[2] === 'time') return v > 0 ? fmtDuration(v) : '0'
    if (def[2] === 'date') return v ? new Date(ticksToMs(v)).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : t('stats.unknown')
    return fmtInt(v)
  }
}

function useQuestCounts() {
  const { state } = useGame()
  const q = Object.values(state.profile.quests ?? {})
  return {
    questsDone: q.filter((x) => x.state === 3).length,
    stepsDone: q.reduce((n, x) => n + Object.values(x.steps).filter((s) => s.state === 2 || x.state >= 2).length, 0),
  }
}

/** Übersicht: je Einheit die Gesamtzeit (bzw. Spielzeit) */
function StatsOverview() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const name = useEntityName()
  const fmt = useFormat()
  const pick = useLangPick()
  const extra = useQuestCounts()
  const entities = Object.keys(index.data.statistics ?? {}).sort((a, b) => {
    const ia = ORDER.indexOf(a)
    const ib = ORDER.indexOf(b)
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    return name(a).localeCompare(name(b))
  })
  return (
    <>
      {!state.profile.values && <p className="note">{t('stats.needSave')}</p>}
      <div className="stats-grid">
        {entities.map((e) => {
          const first = index.data.statistics![e].ValueStatistics?.find((id) => STAT_DEFS[short(id)]?.[2] === 'time') ?? index.data.statistics![e].ValueStatistics?.[0]
          const def = first ? STAT_DEFS[short(first)] : undefined
          return (
            <button key={e} className="stats-card" onClick={() => dispatch({ type: 'view', view: { kind: 'stats', entity: e } })}>
              <GameIcon src={entityIcon(index, e)} size={24} />
              <span className="grow">
                <b>{name(e)}</b>
                {def && first && (
                  <span className="muted">
                    {label(def, pick)}: {fmt(def, statValue(state.profile, first, def, extra))}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function useLangPick() {
  const { lang } = useI18n()
  return lang === 'de' ? 0 : 1
}
const label = (def: StatDef, pick: number) => STAT_LABELS[def[0]]?.[pick] ?? def[0]

function EntityStats({ entity }: { entity: Id }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const fmt = useFormat()
  const pick = useLangPick()
  const extra = useQuestCounts()
  const lists = index.data.statistics![entity]
  const values = (lists.ValueStatistics ?? []).map((id) => ({ id, def: STAT_DEFS[short(id)] })).filter((x) => x.def)
  const currencies = (lists.CurrencyStatistics ?? []).map((id) => ({ id, def: STAT_DEFS[short(id)] })).filter((x) => x.def)
  const items = (lists.ItemStatistics ?? []).map((id) => ({ id, def: STAT_DEFS[short(id)] })).filter((x) => x.def)
  return (
    <>
      <div className="form-group">
        {values.map(({ id, def }) => (
          <div key={id} className="form-row stat-row">
            <span className="grow">{label(def!, pick)}</span>
            <b className="num">{fmt(def!, statValue(state.profile, id, def!, extra))}</b>
          </div>
        ))}
      </div>
      {currencies.map(({ id, def }) => {
        const map = state.profile.stats?.[id] ?? {}
        const rows = Object.entries(map).filter(([, v]) => v > 0)
        if (!rows.length) return null
        return (
          <section key={id}>
            <div className="group-title">{label(def!, pick)}</div>
            <div className="form-group">
              {rows.map(([c, v]) => (
                <div key={c} className="form-row stat-row">
                  <GameIcon src={index.currencies.get(c)?.icon} size={18} />
                  <span className="grow">{index.currencies.get(c)?.name ?? short(c)}</span>
                  <b className="num">{fmtInt(v)}</b>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {items.map(({ id, def }) => (
        <ItemTable key={id} title={label(def!, pick)} map={state.profile.stats?.[id] ?? {}} />
      ))}
      {!state.profile.values && <p className="note">{t('stats.needSave')}</p>}
    </>
  )
}

/** Items einer Statistik (gewonnen, verbraucht, gefunden …), die meisten zuerst */
function ItemTable({ title, map }: { title: string; map: Record<Id, number> }) {
  const { index, dispatch } = useGame()
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  const rows = Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  if (!rows.length) return null
  return (
    <section>
      <div className="group-title">
        {title} <span className="muted">{t('stats.items', { n: rows.length })}</span>
      </div>
      <div className="stat-items">
        {(all ? rows : rows.slice(0, 12)).map(([id, v]) => (
          <button key={id} className="stat-item" data-entity={`item:${id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id } })}>
            <GameIcon src={index.items.get(id)?.icon} size={22} />
            <span className="grow">{index.items.get(id)?.name ?? short(id)}</span>
            <b className="num">{fmtInt(v)}</b>
          </button>
        ))}
      </div>
      {rows.length > 12 && (
        <button className="link" onClick={() => setAll(!all)}>
          {all ? t('stats.less') : t('stats.more', { n: rows.length - 12 })}
        </button>
      )}
    </section>
  )
}
