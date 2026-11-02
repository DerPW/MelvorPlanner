import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { actionTime, rankSources, unmetReqs, yieldOf } from '../core/planner'
import type { Id } from '../core/types'
import { useT } from '../i18n'
import { GameIcon, LevelTag, Stepper, Sym } from './components'
import { Needs, SourceText, sourceEntity } from './SolutionView'
import { itemRoute, planItem, useGame } from './state'

export function Inspector({ item: id }: { item: Id }) {
  const { index, bonus, state, dispatch } = useGame()
  const t = useT()
  const item = index.items.get(id)
  if (!item) return <div className="insp-empty">{t('insp.unknown')}</div>

  const route = itemRoute(state, id)
  const viewing = route && state.view.kind === 'route' && state.view.id === route.id
  const stock = state.profile.inventory[id] ?? 0
  const sources = rankSources(index, id, state.profile)
  const chosen = state.choices[id]
  const current = (chosen && sources.find((r) => r.id === chosen)) || sources[0]
  const usedIn = [...new Set((index.consumers.get(id) ?? []).filter((r) => !r.demoLocked).flatMap((r) => r.outputs.slice(0, 1).map((o) => o.item)))]
  const sells = item.sells

  return (
    <div className="insp">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="icon-btn" aria-label={t('common.close')} onClick={() => dispatch({ type: 'select', item: null })}>
          <Sym name="close" size={14} />
        </button>
      </div>
      <div className="insp-head">
        <div className="insp-icon">
          <GameIcon src={item.icon} size={60} entity={`item:${id}`} />
        </div>
        <h2>{item.name}</h2>
        <button className="link" onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id } })}>
          {t('insp.details')} <Sym name="chevron" size={10} />
        </button>
        {sells && (
          <p>
            {t('insp.sells')} <GameIcon src={index.currencies.get(sells.currency)?.icon} size={14} /> {fmtInt(sells.qty)}
          </p>
        )}
      </div>

      <div className="insp-section">
        <div className="insp-box">
          <div className="insp-line">
            <span className="grow">{t(route ? 'insp.goal' : 'insp.build')}</span>
            {route ? (
              <>
                <Stepper label={t('route.qty')} value={route.qty} min={1} onChange={(qty) => dispatch({ type: 'updateRoute', route: { ...route, qty } })} />
                {!viewing && (
                  <button className="icon-btn" aria-label={t('route.open')} title={t('route.open')} onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: route.id } })}>
                    <Sym name="chevron" size={12} />
                  </button>
                )}
              </>
            ) : (
              <button className="btn primary small" onClick={() => dispatch(planItem(id))}>
                <Sym name="plus" size={12} /> {t('insp.planRoute')}
              </button>
            )}
          </div>
          <div className="insp-line">
            <span className="grow">{t('insp.inStock')}</span>
            <Stepper label={t('insp.inStock')} value={stock} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
          </div>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">
          <span>{t('insp.sources')}</span>
          {chosen && (
            <button className="link" onClick={() => dispatch({ type: 'choose', item: id, recipe: null })}>
              {t('insp.auto')}
            </button>
          )}
        </div>
        <div className="insp-box">
          {sources.length === 0 && <div className="insp-line muted">{t('insp.noSource')}</div>}
          {sources.map((r, i) => {
            const per = yieldOf(r, id, state.profile)
            const ms = per > 0 ? actionTime(r, state.profile) / per : 0
            const skill = r.skill ? index.skills.get(r.skill) : null
            const unmet = unmetReqs(r.reqs, state.profile)
            return (
              <button
                key={r.id}
                className={`source ${r.demoLocked ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'choose', item: id, recipe: r.id })}
                title={r.demoLocked ? t('insp.demoLocked') : undefined}
              >
                <span className={`radio ${current?.id === r.id ? 'on' : ''}`} />
                <GameIcon src={skill?.icon ?? r.icon} size={20} className="skill" entity={sourceEntity(r)} />
                <span style={{ minWidth: 0 }}>
                  <span className="t">
                    <span className="name">
                      <SourceText r={r} self={id} />
                    </span>
                    <LevelTag level={r.level} have={r.skill ? (state.profile.levels[r.skill] ?? 1) : 1} />
                    {i === 0 && !chosen && <span className="tag std">{t('insp.default')}</span>}
                    {bonus.perRecipe.get(r.id)?.some((a) => a.supported) && <span className="tag bonus">{t('bonus.tag')}</span>}
                    {r.demoLocked && <span className="tag locked">Demo</span>}
                  </span>
                  <span className="d">
                    <span>{t(`kind.${r.kind}`)}</span>
                    {ms > 0 && <span>{t('insp.perUnit', { time: fmtDurationShort(ms) })}</span>}
                    {per !== 1 && per > 0 && <span>{t('insp.perRun', { n: fmtNum(Math.round(per * 1000) / 1000) })}</span>}
                    {r.costs.map((c) => (
                      <span key={c.currency} className="gold">
                        <GameIcon src={index.currencies.get(c.currency)?.icon} size={13} />
                        {fmtInt(c.qty)}
                      </span>
                    ))}
                    {r.inputs.map((inp) => (
                      <span key={inp.item}>
                        <GameIcon src={index.items.get(inp.item)?.icon} size={13} entity={`item:${inp.item}`} />
                        {fmtNum(inp.qty)}
                      </span>
                    ))}
                    <Needs reqs={unmet.filter((q) => q.type !== 'level')} className="bad" />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {usedIn.length > 0 && (
        <div className="insp-section">
          <div className="insp-label">
            <span>{t('insp.usedFor')}</span>
            <span>{usedIn.length}</span>
          </div>
          <div className="insp-box used-in">
            {usedIn.slice(0, 40).map((o) => (
              <button key={o} data-entity={`item:${o}`} onClick={() => dispatch({ type: 'select', item: o })}>
                <GameIcon src={index.items.get(o)?.icon} size={24} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
