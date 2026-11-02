// Guide wie im Spiel (Kopf-Knopf „Guide“, im Spiel ein Tutorial-Fenster je
// Skill): Schwierigkeit in Zitronen, Hinweise und Abschnitte. Die Texte stehen
// nur in den Szenen der Spieldatei — auf Englisch, so wie im Spiel.

import { Fragment, type ReactNode } from 'react'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Toolbar } from './components'
import { entityIcon, useEntityName } from './StatsView'
import { useGame } from './state'

const LEMON = 'game/icons/Items/Lemon.webp'

export function GuideView({ skill }: { skill?: Id }) {
  const { index } = useGame()
  const { t } = useI18n()
  const name = useEntityName()
  const tut = skill ? index.data.tutorials?.[skill] : undefined
  return (
    <>
      <Toolbar title={skill ? `${name(skill)} · ${t('guide.title')}` : t('guide.title')} subtitle={t('guide.subtitle')} />
      <div className="content narrow-content">{skill && tut ? <SkillGuide skill={skill} /> : <GuideOverview />}</div>
    </>
  )
}

function Lemons({ groups }: { groups: { filled: number; total: number }[] }) {
  const { t } = useI18n()
  return (
    <span className="lemons" title={t('guide.difficulty')}>
      {groups.map((g, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="muted"> {t('guide.to')} </span>}
          {Array.from({ length: g.total }, (_, k) => (
            <img key={k} src={LEMON} alt="" className={k < g.filled ? '' : 'off'} />
          ))}
        </Fragment>
      ))}
    </span>
  )
}

function GuideOverview() {
  const { index, dispatch } = useGame()
  const name = useEntityName()
  const list = Object.entries(index.data.tutorials ?? {}).sort((a, b) => name(a[0]).localeCompare(name(b[0])))
  return (
    <div className="stats-grid">
      {list.map(([id, tut]) => (
        <button key={id} className="stats-card" onClick={() => dispatch({ type: 'view', view: { kind: 'guide', skill: id } })}>
          <GameIcon src={entityIcon(index, id)} size={24} />
          <span className="grow">
            <b>{name(id)}</b>
            <Lemons groups={tut.difficulty} />
          </span>
        </button>
      ))}
    </div>
  )
}

function SkillGuide({ skill }: { skill: Id }) {
  const { index } = useGame()
  const { t } = useI18n()
  const name = useEntityName()
  const tut = index.data.tutorials![skill]
  // Kampf hat Reiter — als Gruppen untereinander
  const groups = [...new Set(tut.sections.map((s) => s.group))]
  return (
    <>
      <section className="guide-head">
        <GameIcon src={entityIcon(index, skill)} size={40} />
        <div>
          <h2>{name(skill)}</h2>
          <span className="muted">
            {t('guide.difficulty')} <Lemons groups={tut.difficulty} />
          </span>
        </div>
      </section>
      {tut.notes.map((n, i) => (
        <p key={i} className="note">
          {n}
        </p>
      ))}
      {groups.map((g) => (
        <Fragment key={g ?? ''}>
          {g && <div className="group-title">{g}</div>}
          <div className="guide-sections">
            {tut.sections
              .filter((s) => s.group === g)
              .map((s, i) => (
                <section key={i} className="guide-section">
                  {s.title && <h3>{s.title}</h3>}
                  <p>{bbcode(s.body)}</p>
                </section>
              ))}
          </div>
        </Fragment>
      ))}
      <p className="muted guide-source">{t('guide.source')}</p>
    </>
  )
}

/** BBCode der Spieltexte → React: [b], [i], [u], [color=…] (als Hervorhebung), Zeilenumbrüche; Unbekanntes fällt weg */
export function bbcode(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const stack: { tag: string; children: ReactNode[] }[] = [{ tag: '', children: out }]
  const re = /\[(\/?)(\w+)(?:=[^\]]*)?\]/g
  let last = 0
  let key = 0
  const push = (s: string) => {
    const parts = s.split('\n')
    parts.forEach((p, i) => {
      if (i > 0) stack.at(-1)!.children.push(<br key={key++} />)
      if (p) stack.at(-1)!.children.push(p)
    })
  }
  for (const m of text.matchAll(re)) {
    push(text.slice(last, m.index))
    last = m.index! + m[0].length
    const [, close, tag] = m
    if (!['b', 'i', 'u', 'color'].includes(tag)) continue
    if (!close) {
      stack.push({ tag, children: [] })
      continue
    }
    const i = stack.findLastIndex((x) => x.tag === tag)
    if (i <= 0) continue
    while (stack.length > i) {
      const top = stack.pop()!
      const El = top.tag === 'b' ? 'b' : top.tag === 'i' ? 'i' : top.tag === 'u' ? 'u' : 'mark'
      stack.at(-1)!.children.push(
        <El key={key++} className={El === 'mark' ? 'bb-hl' : undefined}>
          {top.children}
        </El>,
      )
    }
  }
  push(text.slice(last))
  // Nicht geschlossene Tags: Inhalt einfach anhängen
  while (stack.length > 1) {
    const top = stack.pop()!
    stack.at(-1)!.children.push(...top.children)
  }
  return out
}
