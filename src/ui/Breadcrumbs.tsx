// Brotkrumen: Folgt man Verweisen von Seite zu Seite, wächst oben der Pfad
// mit. Seitenleiste und Suche beginnen einen neuen; ein Klick auf eine Station
// springt dorthin zurück und kürzt den Pfad.

import { Fragment } from 'react'
import type { GameIndex } from '../core/planner'
import { useT, type T } from '../i18n'
import { GameIcon, Sym } from './components'
import { routeEntity, routeIcon, routeLabel } from './routeText'
import { useGame, type State, type View } from './state'
import { wikiStation } from './WikiView'
import { recipeAction } from './SolutionView'
import { entityIcon, entityName } from './StatsView'

const ui = (name: string) => `game/icons/Icons/${name}.webp`

function station(index: GameIndex, state: State, v: View, t: T): { label: string; icon: string | null; entity: string | null } {
  if (v.kind === 'routes') return { label: t('home.title'), icon: ui('CompletionLog'), entity: null }
  if (v.kind === 'profile') return { label: t('profile.title'), icon: ui('Settings_64'), entity: null }
  if (v.kind === 'combat') return { label: t('combat.title'), icon: ui('Combat'), entity: null }
  if (v.kind === 'bank') return { label: t('bank.title'), icon: ui('Bank'), entity: null }
  if (v.kind === 'shop') return { label: t('shop.title'), icon: ui('Shop'), entity: null }
  if (v.kind === 'wiki') return { ...wikiStation(index, t, v), entity: null }
  // Mastery, Statistiken, Guide: je Skill „Woodcutting · Mastery“, sonst die Übersicht
  if (v.kind === 'mastery' || v.kind === 'stats' || v.kind === 'guide') {
    const id = v.kind === 'stats' ? v.entity : v.skill
    const title = t(`${v.kind}.title`)
    const fallback = v.kind === 'mastery' ? ui('Mastery_Icon') : v.kind === 'stats' ? ui('Statistics_64') : ui('GuideBook')
    return { label: id ? `${entityName(index, t, id)} · ${title}` : title, icon: id ? entityIcon(index, id) : fallback, entity: null }
  }
  if (v.kind === 'quests') {
    const q = v.quest ? index.data.quests?.find((x) => x.id === v.quest) : undefined
    return { label: q?.name ?? t('quests.title'), icon: ui(q ? 'QuestStepIcon' : 'Quests'), entity: null }
  }
  if (v.kind === 'editor') return { label: t('edit.title'), icon: ui('Edit'), entity: null }
  if (v.kind === 'live') return { label: t('live.view'), icon: ui('Mastery_Icon'), entity: null }
  if (v.kind === 'completion') return { label: t('completion.title'), icon: ui('Milestones'), entity: null }
  if (v.kind === 'gear') return { label: t('gear.title'), icon: index.items.get('MelvorBase:IronHelmet')?.icon ?? ui('Combat'), entity: null }
  if (v.kind === 'skill') {
    const s = index.skills.get(v.skill)
    return { label: s?.name ?? v.skill, icon: s?.icon ?? null, entity: `skill:${v.skill}` }
  }
  if (v.kind === 'route') {
    const r = state.routes.find((x) => x.id === v.id)
    return r ? { label: routeLabel(index, r), icon: routeIcon(index, r), entity: routeEntity(r) } : { label: '—', icon: null, entity: null }
  }
  const entity = `${v.type}:${v.id}`
  if (v.type === 'recipe') {
    const r = index.recipes.get(v.id)
    return { label: r ? recipeAction(t, r) : v.id, icon: r?.icon ?? null, entity }
  }
  if (v.type === 'item') {
    const i = index.items.get(v.id)
    return { label: i?.name ?? v.id, icon: i?.icon ?? null, entity }
  }
  if (v.type === 'purchase') {
    const p = index.purchases.get(v.id)
    return { label: p?.name ?? v.id, icon: p?.icon ?? null, entity }
  }
  if (v.type === 'enemy') {
    const e = index.data.enemies?.find((x) => x.id === v.id)
    return { label: e?.name ?? v.id, icon: e?.icon ?? null, entity }
  }
  const a = index.data.areas?.find((x) => x.id === v.id)
  return { label: a?.name ?? v.id, icon: a?.icon ?? ui('Combat'), entity }
}

export function Breadcrumbs() {
  const { index, state, dispatch } = useGame()
  const t = useT()
  if (state.trail.length < 2) return null
  return (
    <nav className="crumbs" aria-label={t('crumbs.label')}>
      {state.trail.map((v, i) => {
        const s = station(index, state, v, t)
        const last = i === state.trail.length - 1
        return (
          <Fragment key={i}>
            {i > 0 && <Sym name="chevron" size={9} className="crumb-sep" />}
            {last ? (
              <span className="crumb current" aria-current="page">
                <GameIcon src={s.icon} size={14} />
                <span className="crumb-label">{s.label}</span>
              </span>
            ) : (
              <button className="crumb" data-entity={s.entity ?? undefined} onClick={() => dispatch({ type: 'view', view: v })}>
                <GameIcon src={s.icon} size={14} />
                <span className="crumb-label">{s.label}</span>
              </button>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
