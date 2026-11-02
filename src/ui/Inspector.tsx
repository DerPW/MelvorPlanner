import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { actionTime, rankSources, unmetReqs, yieldOf } from '../core/planner'
import type { Id } from '../core/types'
import { GameIcon, LevelTag, Stepper, Sym } from './components'
import { recipeAction } from './SolutionView'
import { useGame } from './state'

const KIND: Record<string, string> = {
  artisan: 'Herstellen',
  cooking: 'Kochen',
  woodcutting: 'Holzfällen',
  mining: 'Bergbau',
  fishing: 'Angeln',
  firemaking: 'Nebenprodukt',
  thieving: 'Thieving-Beute',
  farming: 'Farming',
  mill: 'Mühle',
  shop: 'Shop',
  upgrade: 'Aufwerten',
}

export function Inspector({ item: id }: { item: Id }) {
  const { index, bonus, state, dispatch } = useGame()
  const item = index.items.get(id)
  if (!item) return <div className="insp-empty">Unbekanntes Item</div>

  const goal = state.items.find((g) => g.item === id)
  const stock = state.profile.inventory[id] ?? 0
  const sources = rankSources(index, id, state.profile)
  const chosen = state.choices[id]
  const current = (chosen && sources.find((r) => r.id === chosen)) || sources[0]
  const usedIn = [...new Set((index.consumers.get(id) ?? []).filter((r) => !r.demoLocked).flatMap((r) => r.outputs.slice(0, 1).map((o) => o.item)))]
  const sells = item.sells

  return (
    <div className="insp">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="icon-btn" aria-label="Schliessen" onClick={() => dispatch({ type: 'select', item: null })}>
          <Sym name="close" size={14} />
        </button>
      </div>
      <div className="insp-head">
        <div className="insp-icon">
          <GameIcon src={item.icon} size={60} />
        </div>
        <h2>{item.name}</h2>
        {sells && (
          <p>
            Verkauf <GameIcon src={index.currencies.get(sells.currency)?.icon} size={14} /> {fmtInt(sells.qty)}
          </p>
        )}
      </div>

      <div className="insp-section">
        <div className="insp-box">
          <div className="insp-line">
            <span className="grow">{goal ? 'Ziel' : 'Bauen'}</span>
            {goal ? (
              <>
                <Stepper label="Zielmenge" value={goal.qty} min={1} onChange={(qty) => dispatch({ type: 'setItemQty', item: id, qty })} />
                <button className="icon-btn" aria-label="Ziel entfernen" title="Ziel entfernen" onClick={() => dispatch({ type: 'removeItem', item: id })}>
                  <Sym name="close" size={13} />
                </button>
              </>
            ) : (
              <button className="btn primary small" onClick={() => dispatch({ type: 'addItem', item: id })}>
                <Sym name="plus" size={12} /> Zum Plan
              </button>
            )}
          </div>
          <div className="insp-line">
            <span className="grow">Im Lager</span>
            <Stepper label="Im Lager" value={stock} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
          </div>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">
          <span>Quellen</span>
          {chosen && (
            <button className="link" onClick={() => dispatch({ type: 'choose', item: id, recipe: null })}>
              Automatisch
            </button>
          )}
        </div>
        <div className="insp-box">
          {sources.length === 0 && <div className="insp-line muted">Keine bekannte Quelle (Drop, Hunting, Ranching …)</div>}
          {sources.map((r, i) => {
            const per = yieldOf(r, id, state.profile)
            const t = per > 0 ? actionTime(r, state.profile) / per : 0
            const skill = r.skill ? index.skills.get(r.skill) : null
            const unmet = unmetReqs(r.reqs, state.profile)
            return (
              <button
                key={r.id}
                className={`source ${r.demoLocked ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'choose', item: id, recipe: r.id })}
                title={r.demoLocked ? 'In der Demo gesperrt' : undefined}
              >
                <span className={`radio ${current?.id === r.id ? 'on' : ''}`} />
                <GameIcon src={skill?.icon ?? r.icon} size={20} className="skill" />
                <span style={{ minWidth: 0 }}>
                  <span className="t">
                    <span className="name">{recipeAction(r)}</span>
                    <LevelTag level={r.level} have={r.skill ? (state.profile.levels[r.skill] ?? 1) : 1} />
                    {i === 0 && !chosen && <span className="tag std">Standard</span>}
                    {bonus.perRecipe.get(r.id)?.some((a) => a.supported) && <span className="tag bonus">Bonus</span>}
                    {r.demoLocked && <span className="tag locked">Demo</span>}
                  </span>
                  <span className="d">
                    <span>{KIND[r.kind]}</span>
                    {t > 0 && <span>{fmtDurationShort(t)} je Stück</span>}
                    {per !== 1 && per > 0 && <span>{fmtNum(Math.round(per * 1000) / 1000)} je Durchlauf</span>}
                    {r.costs.map((c) => (
                      <span key={c.currency} className="gold">
                        <GameIcon src={index.currencies.get(c.currency)?.icon} size={13} />
                        {fmtInt(c.qty)}
                      </span>
                    ))}
                    {r.inputs.map((inp) => (
                      <span key={inp.item}>
                        <GameIcon src={index.items.get(inp.item)?.icon} size={13} />
                        {fmtNum(inp.qty)}
                      </span>
                    ))}
                    {unmet
                      .filter((q) => q.type !== 'level')
                      .map((q, k) => (
                        <span key={k} className="bad">
                          braucht {q.type === 'purchase' ? q.name : q.type === 'item' ? index.items.get(q.item)?.name : ''}
                        </span>
                      ))}
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
            <span>Verwendet für</span>
            <span>{usedIn.length}</span>
          </div>
          <div className="insp-box used-in">
            {usedIn.slice(0, 40).map((o) => (
              <button key={o} title={index.items.get(o)?.name} onClick={() => dispatch({ type: 'select', item: o })}>
                <GameIcon src={index.items.get(o)?.icon} size={24} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
