import { useMemo, useState } from 'react'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { actionTime, isAvailable, successChance } from '../core/planner'
import { GP, unitCosts } from '../core/route'
import type { Id } from '../core/types'
import { GameIcon, LevelTag, Segmented, Sym, Toolbar } from './components'
import { recipeAction } from './SolutionView'
import { newId, useGame } from './state'

type Sort = 'level' | 'xp' | 'gold'

export function SkillView({ skill }: { skill: Id }) {
  const { index, state, dispatch } = useGame()
  const s = index.skills.get(skill)
  const level = state.profile.levels[skill] ?? 1
  const [sort, setSort] = useState<Sort>('level')

  const withMaterials = state.options.includeMaterials
  const rows = useMemo(() => {
    // Mit „Material selbst beschaffen" zählt die Zeit der ganzen Kette mit —
    // dieselbe Rechnung wie in den Routen
    const unit = unitCosts(index, state.profile)
    const list = index.data.recipes
      .filter((r) => r.skill === skill && r.kind !== 'shop' && r.kind !== 'upgrade')
      .map((r) => {
        let t = actionTime(r, state.profile)
        const sc = successChance(r, state.profile)
        let value =
          r.outputs.reduce((sum, o) => {
            const sells = index.items.get(o.item)?.sells
            return sum + (sells?.currency === GP ? sells.qty * o.qty * o.chance * sc : 0)
          }, 0) + (r.currencyOutputs ?? []).reduce((sum, c) => sum + (c.currency === GP ? c.qty * c.chance * sc : 0), 0)
        for (const c of r.costs) if (c.currency === GP) value -= c.qty
        let sourced = true
        if (withMaterials) {
          for (const i of r.inputs) {
            const u = unit(i.item)
            if (!u) {
              sourced = false
              continue
            }
            t += u.timeMs * i.qty
            value += u.gold * i.qty
          }
        }
        return {
          r,
          xpH: t > 0 && sourced ? ((r.xp * sc) / t) * 3_600_000 : 0,
          goldH: t > 0 && sourced ? (value / t) * 3_600_000 : 0,
          t,
          sourced,
          available: isAvailable(r, state.profile),
        }
      })
    list.sort((a, b) =>
      sort === 'xp' ? b.xpH - a.xpH : sort === 'gold' ? b.goldH - a.goldH : Number(a.r.demoLocked) - Number(b.r.demoLocked) || a.r.level - b.r.level,
    )
    return list
  }, [index, skill, state.profile, sort, withMaterials])

  const free = rows.filter((x) => x.available).length

  return (
    <>
      <Toolbar
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <GameIcon src={s?.icon} size={20} /> {s?.name}
          </span>
        }
        subtitle={`Level ${level} · ${free} von ${rows.length} Rezepten frei · Raten ${withMaterials ? 'mit' : 'ohne'} Materialbeschaffung`}
      >
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'level', label: 'Level' },
            { value: 'xp', label: 'XP/h' },
            { value: 'gold', label: 'GP/h' },
          ]}
        />
        <button
          className="btn primary"
          onClick={() => dispatch({ type: 'addRoute', route: { id: newId(), kind: 'level', skill, level: Math.min(120, level + 10) } })}
        >
          <Sym name="plus" size={13} /> Level-Route
        </button>
      </Toolbar>
      <div className="content">
        <table className="table">
          <colgroup>
            <col />
            <col style={{ width: 64 }} />
            <col className="hide-narrow" style={{ width: 76 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 84 }} />
            <col className="hide-narrow" style={{ width: '26%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Rezept</th>
              <th>Level</th>
              <th className="num hide-narrow">{withMaterials ? 'Zeit inkl.' : 'Zeit'}</th>
              <th className="num">XP/h</th>
              <th className="num">GP/h</th>
              <th className="hide-narrow">Zutaten</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, xpH, goldH, t, sourced, available }) => {
              const out = r.outputs[0]?.item
              return (
                <tr
                  key={r.id}
                  className={`${!available ? 'dim' : ''} ${out && state.selected === out ? 'selected' : ''}`}
                  onClick={() => out && dispatch({ type: 'select', item: out })}
                >
                  <td>
                    <div className="cell-item">
                      <GameIcon src={r.icon} size={20} />
                      <span className="name">{recipeAction(r)}</span>
                      {r.demoLocked && <span className="tag locked">Demo</span>}
                      {!r.demoLocked && r.reqs.some((q) => q.type === 'purchase' || q.type === 'item') && !available && (
                        <span className="tag warn" title={r.reqs.map((q) => (q.type === 'purchase' ? q.name : q.type === 'item' ? index.items.get(q.item)?.name : '')).join(', ')}>
                          gesperrt
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <LevelTag level={Math.max(r.level, 1)} have={level} />
                  </td>
                  <td className="num hide-narrow" title={sourced ? undefined : 'Material mit deinem Stand nicht beschaffbar'}>
                    {sourced ? fmtDurationShort(t) : <span className="muted">kein Material</span>}
                  </td>
                  <td className="num">{xpH ? fmtInt(xpH) : '—'}</td>
                  <td className="num">{goldH ? <span className={goldH > 0 ? 'gold' : 'bad'}>{fmtInt(goldH)}</span> : '—'}</td>
                  <td className="hide-narrow">
                    <span className="ingredients">
                      {r.inputs.slice(0, 4).map((i) => (
                        <span key={i.item} title={index.items.get(i.item)?.name}>
                          <GameIcon src={index.items.get(i.item)?.icon} size={16} />
                          {fmtNum(i.qty)}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
