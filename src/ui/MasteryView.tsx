// Mastery Guild wie im Spiel (Kopf-Knopf „Mastery“ jeder Skill-Seite): Ohne
// Skill die Übersicht aller Gilden mit Rang und Punkten, mit Skill die
// Rangleiter samt Boni und die Aufgaben je Kategorie mit Fortschritt.

import { useState } from 'react'
import { fmtInt } from '../core/format'
import { masteryProgress, type MasteryProgress, type TaskProgress } from '../core/mastery'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { modLabel, modValue } from './bonusText'
import { GameIcon, Sym, TabPills, Toolbar } from './components'
import { goalEntity, goalText } from './goalText'
import { planItem, useGame } from './state'

type Filter = 'all' | 'open' | 'done'

export function MasteryView({ skill }: { skill?: Id }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const s = skill ? index.skills.get(skill) : null
  const m = skill ? masteryProgress(index, state.profile, skill) : null
  return (
    <>
      <Toolbar
        title={s ? `${s.name} · ${t('mastery.title')}` : t('mastery.title')}
        subtitle={m ? `${m.guild.ranks[m.rank]?.name} · ${t('mastery.points', { n: fmtInt(m.points), total: fmtInt(m.total) })}` : t('mastery.subtitle')}
      />
      <div className="content narrow-content">
        {!state.profile.mastery && <p className="note">{t('mastery.needSave')}</p>}
        {m ? <SkillMastery m={m} /> : <MasteryOverview />}
      </div>
    </>
  )
}

/** Alle Gilden: Rang, Punkte bis zum nächsten Rang */
function MasteryOverview() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const list = index.data.skills
    .map((s) => ({ s, m: masteryProgress(index, state.profile, s.id) }))
    .filter((x): x is { s: (typeof x)['s']; m: MasteryProgress } => !!x.m && x.m.total > 0)
  return (
    <div className="mastery-grid">
      {list.map(({ s, m }) => {
        const next = m.thresholds[m.rank + 1]
        const from = m.thresholds[m.rank] ?? 0
        const share = next ? (m.points - from) / Math.max(1, next - from) : 1
        return (
          <button key={s.id} className="mastery-card" onClick={() => dispatch({ type: 'view', view: { kind: 'mastery', skill: s.id } })}>
            <span className="mc-head">
              <GameIcon src={s.icon} size={26} />
              <span className="grow">
                <b>{s.name}</b>
                <span className="muted">{m.guild.ranks[m.rank]?.name}</span>
              </span>
            </span>
            <span className="cc-bar">
              <span style={{ width: `${Math.min(100, share * 100)}%` }} />
            </span>
            <span className="mc-foot">
              <span>{t('mastery.points', { n: fmtInt(m.points), total: fmtInt(m.total) })}</span>
              <span className="muted">{next ? t('mastery.toNext', { n: fmtInt(next - m.points) }) : t('mastery.maxRank')}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SkillMastery({ m }: { m: MasteryProgress }) {
  const { index } = useGame()
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const bonusOf = (rank: Id) => index.data.bonusSources.filter((b) => b.kind === 'guild' && b.rank === rank && m.guild.bonuses.includes(b.id))
  const cats = m.guild.categories.map((c) => ({ c, tasks: m.tasks.filter((x) => x.task.category === c.id) }))
  const shown = (x: TaskProgress) => (filter === 'all' ? true : filter === 'done' ? x.done : !x.done)
  const locked = cats.filter((x) => x.c.demoLocked && !x.tasks.length)
  return (
    <>
      {/* Rangleiter: ab wie vielen Punkten, was er bringt */}
      <ol className="rank-ladder">
        {m.guild.ranks.map((r, i) => (
          <li key={r.id} className={`${i <= m.rank ? 'reached' : ''} ${i === m.rank ? 'current' : ''}`}>
            <span className="rl-mark">{i <= m.rank ? <Sym name="check" size={11} /> : i + 1}</span>
            <span className="grow">
              <b>{r.name}</b>
              <span className="muted">{i === 0 ? t('mastery.start') : t('mastery.from', { n: fmtInt(m.thresholds[i]) })}</span>
            </span>
            <span className="rl-bonus">
              {bonusOf(r.id).flatMap((b) =>
                b.mods.map((mod, k) => (
                  <span key={`${b.id}${k}`} className="chip bonus">
                    {modValue(mod, mod.value)} {modLabel(mod, t)}
                  </span>
                )),
              )}
            </span>
          </li>
        ))}
      </ol>

      <TabPills<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('bank.all'), count: m.tasks.length },
          { value: 'open', label: t('mastery.open'), count: m.tasks.filter((x) => !x.done).length },
          { value: 'done', label: t('mastery.done'), count: m.tasks.filter((x) => x.done).length },
        ]}
      />
      {cats
        .filter((x) => x.tasks.some(shown))
        .map(({ c, tasks }) => (
          <section key={c.id} className="mastery-cat">
            <div className="group-title">
              {c.name}
              <span className="muted">
                {t('mastery.catPoints', { n: c.points })} · {tasks.filter((x) => x.done).length}/{tasks.length}
              </span>
            </div>
            <ol className="task-list">
              {tasks.filter(shown).map((x) => (
                <TaskRow key={x.task.id} x={x} />
              ))}
            </ol>
          </section>
        ))}
      {locked.length > 0 && <p className="muted mastery-locked">{t('mastery.lockedCats', { names: locked.map((x) => x.c.name).join(', ') })}</p>}
    </>
  )
}

function TaskRow({ x }: { x: TaskProgress }) {
  const { index, dispatch } = useGame()
  const { t, lang } = useI18n()
  const entity = goalEntity(index, x.goal)
  const icon = entity?.startsWith('item:') ? index.items.get(entity.slice(5))?.icon : entity?.startsWith('enemy:') ? index.data.enemies?.find((e) => e.id === entity.slice(6))?.icon : null
  const item = entity?.startsWith('item:') ? entity.slice(5) : null
  const left = Math.max(0, x.target - x.value)
  return (
    <li className={`task ${x.done ? 'done' : ''}`} data-entity={entity ?? undefined}>
      <span className={`task-check ${x.done ? 'on' : ''}`}>{x.done && <Sym name="check" size={11} />}</span>
      {icon ? <GameIcon src={icon} size={22} entity={entity} /> : <span className="task-icon-gap" />}
      <span className="grow">
        <span className="task-text">{x.task.text ?? goalText(index, x.goal, t, lang)}</span>
        {!x.done && x.target > 1 && !x.unknown && (
          <span className="task-progress">
            <span className="cc-bar">
              <span style={{ width: `${Math.min(100, (x.value / x.target) * 100)}%` }} />
            </span>
            <span className="muted">
              {fmtInt(Math.floor(x.value))} / {fmtInt(x.target)}
            </span>
          </span>
        )}
        {!x.done && x.unknown && <span className="muted task-unknown">{t('mastery.unknown')}</span>}
      </span>
      {!x.done && item && x.kind !== 'trigger' && (
        <button className="link" onClick={() => dispatch(planItem(item, Math.max(1, Math.ceil(left))))}>
          {t('mastery.plan')}
        </button>
      )}
    </li>
  )
}
