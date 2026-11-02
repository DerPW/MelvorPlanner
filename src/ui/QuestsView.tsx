// Quests wie im Spiel: Akt 1 der Demo (eine Kette, MQ1 → MQ8). Je Quest die
// Schritte nacheinander, darin Aufgaben mit Zielen und Abgaben, am Ende die
// Belohnung; der Dialog lässt sich aufklappen. Freigeschaltet wird das Menü im
// Spiel ab Smithing, Fletching und Runecrafting Level 5.

import { useState } from 'react'
import { fmtInt } from '../core/format'
import type { Id, Quest, QuestState } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Sym, Toolbar } from './components'
import { goalEntity, goalText } from './goalText'
import { featureLock, Needs } from './SolutionView'
import { planItem, useGame } from './state'

type Status = 'locked' | 'open' | 'running' | 'claim' | 'done'

function statusOf(q: Quest, quests: Record<Id, QuestState> | undefined): Status {
  const s = quests?.[q.id]?.state ?? 0
  if (s === 3) return 'done'
  if (s === 2) return 'claim'
  if (s === 1) return 'running'
  return q.after.every((p) => quests?.[p]?.state === 3) ? 'open' : 'locked'
}

export function QuestsView({ quest }: { quest?: Id }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const q = quest ? index.data.quests?.find((x) => x.id === quest) : undefined
  const lock = featureLock(index, state.profile, 'MelvorBase:Quests')
  return (
    <>
      <Toolbar title={q ? q.name : t('quests.title')} subtitle={q ? t(`quests.status.${statusOf(q, state.profile.quests)}`) : t('quests.subtitle')} />
      <div className="content narrow-content">
        {lock && (
          <div className="lock-note">
            <Sym name="lock" size={14} />
            <span className="grow">
              <b>{t('lock.title', { name: t('quests.title') })}</b> {lock.unmet.length ? <Needs reqs={lock.unmet} className="" /> : t('lock.demo')}
            </span>
          </div>
        )}
        {q ? <QuestDetail q={q} /> : <QuestList />}
      </div>
    </>
  )
}

function QuestList() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const cats = index.data.questCategories ?? []
  const quests = index.data.quests ?? []
  return (
    <>
      {cats.map((c) => (
        <section key={c.id}>
          <div className="group-title">
            {c.icon && <img src={c.icon} alt="" width={18} height={18} />}
            {c.name} {c.subtitle && <span className="muted">{c.subtitle}</span>}
          </div>
          <ol className="quest-list">
            {quests
              .filter((q) => q.category === c.id)
              .map((q, i) => {
                const st = statusOf(q, state.profile.quests)
                const saved = state.profile.quests?.[q.id]
                const done = st === 'done' || st === 'claim' ? q.steps.length : q.steps.filter((s) => saved?.steps[s.id]?.state === 2).length
                return (
                  <li key={q.id}>
                    <button className={`quest-row qs-${st}`} onClick={() => dispatch({ type: 'view', view: { kind: 'quests', quest: q.id } })}>
                      <span className="quest-n">{i + 1}</span>
                      <span className="grow">
                        <b>{q.name}</b>
                        <span className="muted">{q.description}</span>
                      </span>
                      <span className="quest-side">
                        <span className={`tag ${st === 'done' ? 'ok' : st === 'locked' ? 'locked' : 'std'}`}>{t(`quests.status.${st}`)}</span>
                        <span className="muted">{t('quests.steps', { n: done, total: q.steps.length })}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
          </ol>
        </section>
      ))}
    </>
  )
}

function QuestDetail({ q }: { q: Quest }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const saved = state.profile.quests?.[q.id]
  const st = statusOf(q, state.profile.quests)
  const prev = q.after.map((id) => index.data.quests?.find((x) => x.id === id)?.name ?? id)
  return (
    <>
      <p className="quest-desc">{q.description}</p>
      {st === 'locked' && prev.length > 0 && <p className="note">{t('quests.after', { names: prev.join(', ') })}</p>}
      <ol className="quest-steps">
        {q.steps.map((s, i) => {
          const ss = saved?.steps[s.id]
          const stepDone = st === 'done' || st === 'claim' || ss?.state === 2
          return (
            <li key={s.id} className={`quest-step ${stepDone ? 'done' : ss?.state === 1 ? 'active' : ''}`}>
              <div className="qs-head">
                <span className="quest-n">{stepDone ? <Sym name="check" size={11} /> : i + 1}</span>
                <span className="grow">{stepDone && s.completed ? s.completed : s.description}</span>
              </div>
              <ul className="qs-tasks">
                {s.tasks.map((tk) => (
                  <QuestTask key={tk.id} task={tk} state={ss?.tasks[tk.id]} done={stepDone} />
                ))}
              </ul>
              {s.dialogue.length > 0 && <Dialogue lines={s.dialogue} />}
            </li>
          )
        })}
      </ol>
      <section className="quest-rewards">
        <div className="group-title">{t('quests.rewards')}</div>
        <div className="chips">
          {q.rewards.currencies.map((c) => (
            <span key={c.currency} className="chip">
              <GameIcon src={index.currencies.get(c.currency)?.icon} size={14} /> {fmtInt(c.qty)}
            </span>
          ))}
          {q.rewards.items.map((i) => (
            <span key={i.item} className="chip" data-entity={`item:${i.item}`}>
              <GameIcon src={index.items.get(i.item)?.icon} size={14} /> {fmtInt(i.qty)}× {index.items.get(i.item)?.name ?? i.item}
            </span>
          ))}
        </div>
      </section>
      {q.completion.length > 0 && <Dialogue lines={q.completion} label={t('quests.completionDialogue')} />}
    </>
  )
}

function QuestTask({ task, state, done }: { task: Quest['steps'][number]['tasks'][number]; state?: QuestState['steps'][string]['tasks'][string]; done: boolean }) {
  const { index, state: app, dispatch } = useGame()
  const { t, lang } = useI18n()
  const finished = done || state?.state === 2
  return (
    <>
      {task.goals.map((g) => {
        const gs = state?.goals[String(g.id ?? '0')]
        const value = finished ? g.max : Math.min(g.max, gs?.progress ?? 0)
        const entity = goalEntity(index, g)
        const item = entity?.startsWith('item:') ? entity.slice(5) : null
        const icon = item ? index.items.get(item)?.icon : entity?.startsWith('enemy:') ? index.data.enemies?.find((e) => e.id === entity.slice(6))?.icon : null
        return (
          <li key={`g${g.id}`} className={`task ${finished || gs?.complete ? 'done' : ''}`} data-entity={entity ?? undefined}>
            <span className={`task-check ${finished || gs?.complete ? 'on' : ''}`}>{(finished || gs?.complete) && <Sym name="check" size={11} />}</span>
            {icon ? <GameIcon src={icon} size={20} entity={entity} /> : <span className="task-icon-gap" />}
            <span className="grow">
              <span className="task-text">{goalText(index, g, t, lang)}</span>
              {!finished && g.max > 1 && (
                <span className="task-progress">
                  <span className="cc-bar">
                    <span style={{ width: `${(value / g.max) * 100}%` }} />
                  </span>
                  <span className="muted">
                    {fmtInt(value)} / {fmtInt(g.max)}
                  </span>
                </span>
              )}
            </span>
            {!finished && item && (
              <button className="link" onClick={() => dispatch(planItem(item, Math.max(1, g.max - value)))}>
                {t('mastery.plan')}
              </button>
            )}
          </li>
        )
      })}
      {/* Abgaben: Items, die man dem Auftraggeber gibt */}
      {task.items.map((i) => {
        const have = app.profile.inventory[i.item] ?? 0
        return (
          <li key={`i${i.item}`} className={`task ${finished || state?.costsMet ? 'done' : ''}`} data-entity={`item:${i.item}`}>
            <span className={`task-check ${finished || state?.costsMet ? 'on' : ''}`}>{(finished || state?.costsMet) && <Sym name="check" size={11} />}</span>
            <GameIcon src={index.items.get(i.item)?.icon} size={20} entity={`item:${i.item}`} />
            <span className="grow">
              <span className="task-text">
                {t('quests.handIn', { n: fmtInt(i.qty), name: index.items.get(i.item)?.name ?? i.item })}
                {!finished && <span className={have >= i.qty ? 'ok' : 'muted'}> {t('quests.have', { n: fmtInt(have) })}</span>}
              </span>
            </span>
            {!finished && have < i.qty && (
              <button className="link" onClick={() => dispatch(planItem(i.item, i.qty - have))}>
                {t('mastery.plan')}
              </button>
            )}
          </li>
        )
      })}
    </>
  )
}

function Dialogue({ lines, label }: { lines: { npc: Id; text: string }[]; label?: string }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const name = (npc: Id) =>
    npc === 'MelvorBase:Player' ? (state.profile.source?.character ?? t('quests.you')) : npc === 'MelvorBase:Companion' ? t('quests.companion') : (index.data.npcs?.[npc]?.name ?? npc)
  // Die Dialoge sind englisch — Platzhalter englisch füllen (den Namen des Begleiters speichert das Spiel nicht)
  const fill = (s: string) => s.replaceAll('[Player Name]', state.profile.source?.character ?? 'you').replaceAll('[Companion Name]', 'your companion')
  return (
    <div className="dialogue">
      <button className="link" onClick={() => setOpen(!open)}>
        <Sym name="chevron" size={10} className={open ? 'rot' : ''} /> {label ?? t('quests.dialogue', { n: lines.length })}
      </button>
      {open && (
        <div className="dialogue-lines">
          {lines.map((l, i) => (
            <p key={i} className={l.npc === 'MelvorBase:System' ? 'dl-system' : ''}>
              {l.npc !== 'MelvorBase:System' && <b>{name(l.npc)}: </b>}
              {fill(l.text)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
