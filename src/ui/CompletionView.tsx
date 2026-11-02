// Completion wie im Spiel: Items gefunden (Bank-Statistik „gefunden"),
// Monster besiegt (Kampf-Statistik), Skill-Level bis zur Grenze. Fehlendes ist
// ausgegraut — Tooltip und Kontextmenü zeigen, wo es herkommt.

import { useState } from 'react'
import { MAX_LEVEL } from '../core/experience'
import { fmtInt } from '../core/format'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, TabPills, Toolbar } from './components'
import { useGame } from './state'

type Part = 'items' | 'enemies' | 'skills'
type Filter = 'all' | 'missing' | 'done'

const FOUND = 'MelvorBase:BankItemFound'
const KILLED = 'MelvorBase:CombatEnemyKilled'

export function CompletionView() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const [part, setPart] = useState<Part>('items')
  const [filter, setFilter] = useState<Filter>('all')
  const p = state.profile
  const stats = p.stats
  const cap = p.levelCap ?? MAX_LEVEL
  const c = index.data.completion ?? { items: [], enemies: [] }

  const items = c.items.map((id) => ({ id, done: (stats?.[FOUND]?.[id] ?? 0) > 0 }))
  const enemies = c.enemies.map((id) => ({ id, done: (stats?.[KILLED]?.[id] ?? 0) > 0 }))
  // Skills, die es in dieser Version gibt (nicht in der Demo gesperrt)
  const skills = index.data.skills.filter((s) => !index.features.get(s.id)?.demoLocked)
  const levelSum = skills.reduce((n, s) => n + Math.min(cap, p.levels[s.id] ?? 1), 0)
  const parts = [
    { id: 'items' as const, label: t('completion.items'), done: items.filter((x) => x.done).length, total: items.length },
    { id: 'enemies' as const, label: t('completion.enemies'), done: enemies.filter((x) => x.done).length, total: enemies.length },
    { id: 'skills' as const, label: t('completion.skills'), done: levelSum, total: skills.length * cap },
  ]
  const overall = parts.reduce((s, x) => s + (x.total ? x.done / x.total : 0), 0) / parts.length
  const pct = (n: number) => `${(Math.floor(n * 1000) / 10).toLocaleString()} %`

  const list = part === 'items' ? items : part === 'enemies' ? enemies : []
  const shown = list.filter((x) => (filter === 'all' ? true : filter === 'done' ? x.done : !x.done))

  return (
    <>
      <Toolbar title={t('completion.title')} subtitle={stats ? t('completion.subtitle', { pct: pct(overall) }) : t('completion.needSave')} />
      <div className="content narrow-content">
        <div className="completion-cards">
          {parts.map((x) => (
            <button key={x.id} className={`completion-card ${part === x.id ? 'active' : ''}`} onClick={() => setPart(x.id)}>
              <span className="cc-label">{x.label}</span>
              <b>{x.total ? pct(x.done / x.total) : '—'}</b>
              <span className="cc-count">
                {fmtInt(x.done)} / {fmtInt(x.total)}
              </span>
              <span className="cc-bar">
                <span style={{ width: `${x.total ? (x.done / x.total) * 100 : 0}%` }} />
              </span>
            </button>
          ))}
        </div>

        {!stats && <p className="note">{t('completion.needSave')}</p>}

        {part !== 'skills' ? (
          <>
            <TabPills<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('bank.all'), count: list.length },
                { value: 'missing', label: t('completion.missing'), count: list.filter((x) => !x.done).length },
                { value: 'done', label: t('completion.done'), count: list.filter((x) => x.done).length },
              ]}
            />
            <div className="completion-grid">
              {shown.map((x) => (
                <CompletionTile key={x.id} kind={part === 'items' ? 'item' : 'enemy'} id={x.id} done={x.done} onOpen={() => dispatch({ type: 'view', view: { kind: 'detail', type: part === 'items' ? 'item' : 'enemy', id: x.id } })} />
              ))}
            </div>
          </>
        ) : (
          <div className="form-group">
            {skills.map((s) => {
              const lv = Math.min(cap, p.levels[s.id] ?? 1)
              return (
                <button key={s.id} className="form-row completion-skill" data-entity={`skill:${s.id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'skill', skill: s.id } })}>
                  <GameIcon src={s.icon} size={22} />
                  <span className="grow">{s.name}</span>
                  <span className="cc-bar wide">
                    <span style={{ width: `${(lv / cap) * 100}%` }} />
                  </span>
                  <b className="num">
                    {lv} / {cap}
                  </b>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function CompletionTile({ kind, id, done, onOpen }: { kind: 'item' | 'enemy'; id: Id; done: boolean; onOpen: () => void }) {
  const { index } = useGame()
  const icon = kind === 'item' ? index.items.get(id)?.icon : index.data.enemies?.find((e) => e.id === id)?.icon
  return (
    <button className={`completion-tile ${done ? 'done' : ''}`} data-entity={`${kind}:${id}`} onClick={onOpen}>
      <GameIcon src={icon} size={36} />
    </button>
  )
}
