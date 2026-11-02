// Ausrüstung → Skills: den Werkzeuggürtel für eine Aktion optimal belegen.
// Je Platz des Skills (Werkzeug, Handschuhe, Helm …) das Item mit dem größten
// Gewinn — XP/h, Menge/h oder GP/h —, mit Boni, Anforderungen und „Planen“.

import { useMemo, useState } from 'react'
import { fmtInt, fmtNum } from '../core/format'
import { isAvailable, unmetReqs } from '../core/planner'
import { optimizeSkillGear, skillSlots, type SkillMetric, type SkillScope } from '../core/skillGear'
import type { BonusSource, Id } from '../core/types'
import { useI18n } from '../i18n'
import { modLabel, modValue } from './bonusText'
import { GameIcon, Ref, Segmented, Select, Sym } from './components'
import { useTrack } from './LiveTrack'
import { Needs, recipeAction } from './SolutionView'
import { planItem, useGame } from './state'

export function SkillGear() {
  const { index, baseIndex, state, dispatch } = useGame()
  const { t } = useI18n()
  const { action } = useTrack()
  const [metric, setMetric] = useState<SkillMetric>('xp')
  const [scope, setScope] = useState<SkillScope>('all')
  const p = state.profile
  // Skills mit Gürtel-Plätzen
  const skills = index.data.skills.filter((s) => skillSlots(baseIndex, s.id).length > 0)
  const skill = state.gearSkill && skills.some((s) => s.id === state.gearSkill) ? state.gearSkill : (action?.skill?.id && skills.some((s) => s.id === action.skill!.id) ? action.skill.id : skills[0]?.id)
  const recipes = useMemo(
    () => baseIndex.data.recipes.filter((r) => r.skill === skill && !r.demoLocked && r.base && (r.xp > 0 || r.outputs.length)).sort((a, b) => b.level - a.level),
    [baseIndex, skill],
  )
  // Vorwahl: was gerade läuft, sonst die höchste freie Aktion
  const [picked, setPicked] = useState<Id | null>(null)
  const recipe =
    recipes.find((r) => r.id === picked) ??
    recipes.find((r) => r.id === action?.recipe?.id) ??
    recipes.find((r) => isAvailable(r, p)) ??
    recipes[0]
  const result = useMemo(() => (skill && recipe ? optimizeSkillGear(baseIndex, p, skill, recipe, metric, scope) : null), [baseIndex, p, skill, recipe, metric, scope])
  if (!skill) return <p className="muted">{t('sgear.none')}</p>
  const fmt = (v: number) => `${fmtInt(v)} ${metric === 'xp' ? 'XP/h' : metric === 'gold' ? 'GP/h' : t('sgear.perHour')}`
  const gain = result && result.now > 0 ? (result.best / result.now - 1) * 100 : 0

  return (
    <div className="skill-gear">
      <div className="sgear-controls">
        <Select label={t('sgear.skill')} value={skill} onChange={(id) => {
            setPicked(null)
            dispatch({ type: 'gearSkill', skill: id })
          }}>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label={t('sgear.action')} value={recipe?.id ?? ''} onChange={setPicked}>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {recipeAction(t, r)} · Lv {r.level}
            </option>
          ))}
        </Select>
        <Segmented<SkillMetric>
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'xp', label: 'XP/h' },
            { value: 'items', label: t('sgear.items') },
            { value: 'gold', label: 'GP/h' },
          ]}
        />
        <Segmented<SkillScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'owned', label: t('gear.scopeOwned') },
            { value: 'wearable', label: t('sgear.wearable') },
            { value: 'all', label: t('sgear.all') },
          ]}
        />
      </div>

      {result && recipe && (
        <>
          <div className="sgear-summary">
            <GameIcon src={recipe.icon} size={28} entity={`recipe:${recipe.id}`} />
            <span className="grow">
              <Ref entity={`recipe:${recipe.id}`}>{recipeAction(t, recipe)}</Ref>
              <span className="muted">
                {' '}
                · {t('sgear.now', { value: fmt(result.now) })}
              </span>
            </span>
            <b className={gain > 0.05 ? 'ok' : ''}>
              {fmt(result.best)}
              {gain > 0.05 && ` (+${fmtNum(Math.round(gain * 10) / 10)} %)`}
            </b>
          </div>
          <div className="form-group sgear-slots">
            {result.slots.map((s) => (
              <SlotRow key={s.slot} slot={s.slot} current={s.current} best={s.best} candidates={s.candidates} />
            ))}
          </div>
          <p className="muted sgear-hint">{t('sgear.hint')}</p>
        </>
      )}
    </div>
  )
}

function SlotRow({ slot, current, best, candidates }: { slot: Id; current: BonusSource | null; best: BonusSource | null; candidates: BonusSource[] }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const type = index.data.toolbeltTypes?.[slot]
  const p = state.profile
  const owned = (b: BonusSource) => (p.inventory[b.id] ?? 0) > 0 || p.equipped?.includes(b.id)
  const same = best?.id === current?.id
  const unmet = best ? unmetReqs(best.reqs ?? [], p) : []
  return (
    <div className="form-row sgear-slot">
      <span className="sgear-slotname">
        <b>{type?.name ?? slot.replace(/^MelvorBase:/, '')}</b>
        <span className="muted">{current ? t('sgear.equipped', { name: current.name }) : t('sgear.empty')}</span>
      </span>
      {best ? (
        <span className="grow sgear-best" data-entity={`item:${best.id}`}>
          <GameIcon src={best.icon} size={24} entity={`item:${best.id}`} />
          <span className="sgear-text">
            <Ref entity={`item:${best.id}`}>{best.name}</Ref>
            <span className="sgear-mods">
              {best.mods.map((m, i) => (
                <span key={i} className="chip bonus">
                  {modValue(m, m.value)} {modLabel(m, t)}
                </span>
              ))}
            </span>
            {unmet.length > 0 && <Needs reqs={unmet} />}
          </span>
        </span>
      ) : (
        <span className="grow muted">{candidates.length ? t('sgear.noEffect') : '—'}</span>
      )}
      <span className="sgear-status">
        {best && same && (
          <span className="ok">
            <Sym name="check" size={11} /> {t('sgear.keep')}
          </span>
        )}
        {best && !same && owned(best) && <span className="ok">{t('sgear.inBank')}</span>}
        {best && !same && !owned(best) && (
          <button className="link" onClick={() => dispatch(planItem(best.id, 1))}>
            {t('mastery.plan')}
          </button>
        )}
      </span>
    </div>
  )
}
