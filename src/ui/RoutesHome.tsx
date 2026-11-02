// Übersicht der Routen: neues Ziel anlegen, vorhandene öffnen, und ein paar
// Ideen, was mit dem jetzigen Stand gleich zu bauen ist.

import { useMemo } from 'react'
import { fmtInt } from '../core/format'
import { isAvailable } from '../core/planner'
import { GP } from '../core/route'
import type { Id } from '../core/types'
import { useT } from '../i18n'
import { GameIcon, Sym, Toolbar } from './components'
import { ItemSearch } from './ItemSearch'
import { newRoute, routeEntity, routeIcon, routeLabel } from './routeText'
import { planItem, useGame } from './state'
import { PICK_ITEM_EVENT } from './ui'

export function RoutesHome() {
  const { index, state, dispatch } = useGame()
  const t = useT()

  // Ein paar Dinge, die man mit dem jetzigen Stand gleich bauen kann
  const suggestions = useMemo(() => {
    const seen = new Set<Id>()
    return index.data.recipes
      .filter((r) => (r.kind === 'artisan' || r.kind === 'cooking') && isAvailable(r, state.profile) && r.inputs.length >= 2)
      .map((r) => r.outputs[0]?.item)
      .filter((id): id is Id => !!id && !seen.has(id) && !!seen.add(id))
      .slice(0, 8)
  }, [index, state.profile])

  const add = (kind: 'level' | 'gold' | 'unlock') => {
    const route = newRoute(index, state.profile, kind)
    if (route) dispatch({ type: 'addRoute', route })
  }
  const level = newRoute(index, state.profile, 'level')
  const unlock = newRoute(index, state.profile, 'unlock')

  return (
    <>
      <Toolbar title={t('home.title')} subtitle={t('home.subtitle')} />
      <div className="content narrow-content">
        <div className="group-title">{t('home.new')}</div>
        <div className="new-routes">
          <div className="new-route wide">
            <GameIcon src={index.items.get(suggestions[0] ?? 'MelvorBase:IronBar')?.icon} size={32} />
            <div className="nr-text">
              <b>{t('home.item')}</b>
              <p>{t('home.itemText')}</p>
            </div>
            <ItemSearch onPick={(id) => dispatch(planItem(id))} placeholder={t('home.itemSearch')} focusOn={PICK_ITEM_EVENT} autoFocus={state.routes.length === 0} />
          </div>
          <button className="new-route" onClick={() => add('level')}>
            <GameIcon src={level ? routeIcon(index, level) : null} size={28} />
            <b>{t('nav.addLevel')}</b>
            <p>{t('home.levelText')}</p>
          </button>
          <button className="new-route" onClick={() => add('gold')}>
            <GameIcon src={index.currencies.get(GP)?.icon} size={28} />
            <b>{t('nav.addGold')}</b>
            <p>{t('home.goldText')}</p>
          </button>
          <button className="new-route" onClick={() => add('unlock')} disabled={!unlock}>
            <GameIcon src={unlock ? routeIcon(index, unlock) : null} size={28} />
            <b>{t('nav.addUnlock')}</b>
            <p>{t('home.unlockText')}</p>
          </button>
        </div>

        {state.routes.length > 0 && (
          <>
            <div className="group-title">
              {t('home.yours')} <span className="muted">{state.routes.length}</span>
            </div>
            <div className="route-list">
              {state.routes.map((r) => (
                <button key={r.id} className="route-row" data-entity={routeEntity(r) ?? undefined} onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: r.id } })}>
                  <GameIcon src={routeIcon(index, r)} size={22} />
                  <span className="grow">{routeLabel(index, r)}</span>
                  {r.kind === 'item' && <span className="badge">×{fmtInt(r.qty)}</span>}
                  <span className="muted">{t(`route.kind.${r.kind}`)}</span>
                  <Sym name="chevron" size={11} />
                </button>
              ))}
            </div>
          </>
        )}

        {suggestions.length > 0 && (
          <>
            <div className="group-title">
              {t('home.ideas')} <span className="muted">{t('home.ideasHint')}</span>
            </div>
            <div className="notes">
              {suggestions.map((id) => (
                <button key={id} className="note" data-entity={`item:${id}`} onClick={() => dispatch(planItem(id))}>
                  <GameIcon src={index.items.get(id)?.icon} size={16} />
                  {index.items.get(id)?.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
