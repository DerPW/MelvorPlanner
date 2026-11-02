// Live: alles zur laufenden Aktion auf einer Seite — was läuft, wie schnell,
// was es bringt und verbraucht, wann das Material ausgeht, und wo die
// verfolgte Route steht. Restzeiten zählen zwischen den Spielständen mit.

import { useState } from 'react'
import { xpForLevel } from '../core/experience'
import { liveStock } from '../core/live'
import { recipeTotals, statLines } from '../core/bonuses'
import { actionTime, successChance, yieldOf } from '../core/planner'
import type { Recipe } from '../core/types'
import { fmtDurationShort, fmtInt } from '../core/format'
import { useI18n } from '../i18n'
import { GameIcon, Ref, Sym, Toolbar, useNow } from './components'
import { modLabel, modScope, modValue } from './bonusText'
import { EnemyFight } from './CombatView'
import { clockAt, leftNow, Measuring, StepBar, statusLine, totalLeft, useTrack } from './LiveTrack'
import { routeIcon, routeLabel } from './routeText'
import { useGame } from './state'

export function LiveView() {
  const { index, state, dispatch } = useGame()
  const { t, locale } = useI18n()
  const { tracking, action, rates, progress, flow, lastAt } = useTrack()
  const now = useNow(1000)
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const ago = lastAt !== null ? Math.max(0, Math.round((now - lastAt) / 1000)) : null

  if (!state.live)
    return (
      <>
        <Toolbar title={t('live.view')} />
        <div className="content narrow-content">
          <div className="empty">
            <p>{t('live.off')}</p>
            <button className="btn" onClick={() => dispatch({ type: 'view', view: { kind: 'profile' } })}>
              {t('live.toSettings')}
            </button>
          </div>
        </div>
      </>
    )

  const skill = action?.skill ?? null
  const level = skill ? (state.profile.levels[skill.id] ?? 1) : null
  const xpH = skill ? (rates?.xpPerHour[skill.id] ?? 0) : 0
  // XP im Level, ab dem Spielstand mit der gemessenen Rate weitergezählt
  const xpNow = skill ? (state.profile.xp?.[skill.id] ?? 0) + (xpH * Math.max(0, now - (lastAt ?? now))) / 3_600_000 : 0
  const lo = level ? xpForLevel(level) : 0
  const hi = level ? xpForLevel(level + 1) : 0
  const share = level && hi > lo ? Math.min(1, Math.max(0, (xpNow - lo) / (hi - lo))) : 0
  const nextMs = level && xpH > 0 ? Math.max(0, ((hi - xpNow) / xpH) * 3_600_000) : null
  const icon = action?.recipe?.icon ?? action?.enemy?.icon ?? skill?.icon ?? null
  const entity = action?.enemy ? `enemy:${action.enemy.id}` : action?.recipe?.outputs[0] ? `item:${action.recipe.outputs[0].item}` : skill ? `skill:${skill.id}` : null
  const stopMs = flow?.stop ? leftNow(flow.stop.emptyMs, lastAt, now) : null
  const ls = tracking?.status === 'onTrack' ? tracking.live : null

  return (
    <>
      <Toolbar title={t('live.view')} subtitle={ago !== null ? t('live.viewSub', { s: ago }) : undefined} />
      <div className="content narrow-content live-page">
        {/* Was gerade läuft */}
        <section className="lv-hero">
          {action && <GameIcon src={icon} size={44} entity={entity} />}
          <div className="lv-what">
            <span className="lv-eyebrow">
              <i className={action ? 'live-dot' : 'live-dot off'} /> {t('track.now')}
            </span>
            <h2>{action ? <Ref entity={entity}>{action.action || action.entity}</Ref> : t('track.nothing')}</h2>
            {skill && (
              <span className="muted">
                {skill.name} · Lv {level}
              </span>
            )}
            {skill && level && (
              <span className="lv-level">
                <span className="bar live-bar">
                  <span style={{ width: `${share * 100}%` }} />
                </span>
                <span className="muted">{(share * 100).toFixed(1)} %</span>
              </span>
            )}
          </div>
        </section>

        {action && !rates && (
          <p className="lv-measuring">
            <Measuring progress={progress} /> <span className="muted">· {t('track.measuringHint')}</span>
          </p>
        )}

        {action && rates && (
          <div className="lv-tiles">
            {xpH > 0 && <Tile label={t('live.xpRate')} value={`${fmtInt(xpH)} XP/h`} />}
            {nextMs !== null && <Tile label={t('live.nextLevel', { level: (level ?? 1) + 1 })} value={fmtDurationShort(nextMs)} sub={t('live.at', { time: clockAt(now + nextMs, locale, t, now) })} />}
            {rates.goldPerHour > 1 && <Tile label={t('live.goldRate')} value={`${fmtInt(rates.goldPerHour)} GP/h`} tone="gold" />}
            {stopMs !== null && (
              <Tile
                label={t('live.stopsIn')}
                value={fmtDurationShort(stopMs) || t('live.now')}
                sub={stopMs > 0 ? t('live.until', { time: clockAt(now + stopMs, locale, t, now) }) : undefined}
                tone={stopMs < 600_000 ? 'warn' : undefined}
              />
            )}
            <Tile label={t('live.since')} value={fmtDurationShort(now - rates.since)} />
          </div>
        )}

        {flow && (flow.gains.length > 0 || flow.uses.length > 0) && (
          <div className="lv-cols">
            {/* Bestände sekündlich weitergerechnet, beim nächsten Spielstand korrigiert */}
            <FlowList title={t('live.gains')} empty={t('live.noGains')} rows={flow.gains.map((g) => ({ ...g, stock: liveStock(g.stock, g.perHour, lastAt, now), sign: '+' }))} />
            <FlowList
              title={t('live.uses')}
              empty={t('live.noUses')}
              rows={flow.uses.map((u) => ({
                ...u,
                stock: liveStock(u.stock, -u.perHour, lastAt, now),
                sign: '−',
                emptyMs: leftNow(u.emptyMs, lastAt, now),
                first: u.item === flow.stop?.item,
              }))}
            />
          </div>
        )}

        {/* Was eine Aktion dauert und bringt, und welche Boni darauf wirken */}
        {action?.recipe && !action.recipe.combat && (
          <div className="lv-cols">
            <PerAction recipe={action.recipe} />
            <ActionValues recipe={action.recipe} />
            <ActionBonuses recipe={action.recipe} />
          </div>
        )}

        {/* Kampf: dieselben Werte wie auf der Monster-Seite, mit der Ausrüstung aus dem Spiel */}
        {action?.enemy && (
          <section className="lv-list lv-fight">
            <div className="lv-sec-title">{t('live.combatValues')}</div>
            <EnemyFight id={action.enemy.id} />
          </section>
        )}

        {/* Verfolgte Route */}
        <section className="lv-route">
          <div className="lv-sec-title">{t('live.route')}</div>
          {tracking ? (
            <button className={`lc-route ts-${tracking.status}`} onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: tracking.route.id } })}>
              <span className="lc-route-head">
                <GameIcon src={routeIcon(index, tracking.route)} size={18} />
                <span className="grow">{routeLabel(index, tracking.route)}</span>
                {tracking.status !== 'done' && <span className="num">{t('track.total', { time: fmtDurationShort(totalLeft(tracking, now)) })}</span>}
              </span>
              <span className="lc-route-step">{statusLine(t, tracking, now)}</span>
              {ls && ls.perMs > 0 && <StepBar step={ls} now={now} />}
            </button>
          ) : (
            <p className="muted">{t('live.noRoute')}</p>
          )}
        </section>

        {'Notification' in window && perm === 'default' && (
          <button className="link" onClick={() => Notification.requestPermission().then(setPerm)}>
            <Sym name="bell" size={12} /> {t('track.allowNotify')}
          </button>
        )}
      </div>
    </>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'gold' | 'warn' }) {
  return (
    <div className={`lv-tile ${tone ?? ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}

/** Gewinn bzw. Verbrauch je Stunde, mit Bestand; beim Verbrauch, wann er leer ist */
function FlowList({ title, rows, empty }: { title: string; empty?: string; rows: { item: string; perHour: number; stock: number; sign: string; emptyMs?: number; first?: boolean }[] }) {
  const { index } = useGame()
  const { t, locale } = useI18n()
  const now = Date.now()
  return (
    <section className="lv-list">
      <div className="lv-sec-title">{title}</div>
      {rows.length === 0 && <p className="muted">{empty}</p>}
      {rows.slice(0, 8).map((r) => (
        <div key={r.item} className={`lv-row ${r.first ? 'first' : ''}`} data-entity={`item:${r.item}`}>
          <GameIcon src={index.items.get(r.item)?.icon} size={22} />
          <span className="grow">
            <b>{index.items.get(r.item)?.name ?? r.item}</b>
            <span className="muted">{t('live.stock', { n: fmtInt(Math.floor(r.stock)) })}</span>
          </span>
          <span className="lv-num">
            <b>
              {r.sign}
              {fmtInt(r.perHour)}/h
            </b>
            {r.emptyMs !== undefined && (
              <span className={r.first ? 'warn' : 'muted'}>
                {r.emptyMs > 0 ? t('live.emptyInAt', { time: fmtDurationShort(r.emptyMs), clock: clockAt(now + r.emptyMs, locale, t, now) }) : t('live.emptyIn', { time: t('live.now') })}
              </span>
            )}
          </span>
        </div>
      ))}
    </section>
  )
}

/** Je Aktion: Grundwert, mit Boni, gemessen. Gemessen wird über die XP/h —
 *  daraus die Aktionen je Stunde, daraus Zeit und Ertrag je Aktion */
function PerAction({ recipe }: { recipe: Recipe }) {
  const { index, baseIndex, state } = useGame()
  const { t, locale } = useI18n()
  const { rates } = useTrack()
  const p = state.profile
  const base = baseIndex.recipes.get(recipe.id) ?? recipe
  const sec = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const pct = (x: number) => `${num.format(x * 100)} %`
  const xpEach = recipe.xp * successChance(recipe, p)
  const xpH = recipe.skill ? (rates?.xpPerHour[recipe.skill] ?? 0) : 0
  const perHour = xpH > 0 && xpEach > 0 ? xpH / xpEach : null
  const out = recipe.outputs.find((o) => !o.extra)?.item ?? recipe.outputs[0]?.item
  const rows: { label: string; base: number; now: number; measured: number | null; fmt: (x: number) => string; lower?: boolean }[] = [
    { label: t('live.time'), base: actionTime(base, p), now: actionTime(recipe, p), measured: perHour ? 3_600_000 / perHour : null, fmt: (ms) => `${sec.format(ms / 1000)} s`, lower: true },
    { label: 'XP', base: base.xp, now: recipe.xp, measured: null, fmt: (x) => num.format(x) },
  ]
  if (out)
    rows.push({
      label: index.items.get(out)?.name ?? out,
      base: yieldOf(base, out, p),
      now: yieldOf(recipe, out, p),
      measured: perHour && rates && (rates.itemsPerHour[out] ?? 0) > 0 ? rates.itemsPerHour[out] / perHour : null,
      fmt: (x) => `${num.format(x)}×`,
    })
  if (recipe.success) rows.push({ label: t('live.success'), base: successChance(base, p), now: successChance(recipe, p), measured: null, fmt: pct })
  return (
    <section className="lv-list">
      <div className="lv-sec-title">{t('live.perAction')}</div>
      <table className="lv-table">
        <thead>
          <tr>
            <th />
            <th>{t('live.base')}</th>
            <th>{t('live.withBonus')}</th>
            <th>{t('live.measured')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gain = r.lower ? r.base - r.now : r.now - r.base
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{r.fmt(r.base)}</td>
                <td className={`num ${gain > 1e-9 ? 'up' : ''}`}>{r.fmt(r.now)}</td>
                <td className="num">{r.measured !== null ? r.fmt(r.measured) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {perHour && <p className="muted">{t('live.actionsPerHour', { n: fmtInt(perHour) })}</p>}
    </section>
  )
}

/** Die Werte der Aktion wie im Spiel-Panel (Intervall, Zutaten bewahren,
 *  Chance auf doppelt …) — Grundwert und mit Boni */
function ActionValues({ recipe }: { recipe: Recipe }) {
  const { baseIndex, state } = useGame()
  const { t, locale } = useI18n()
  const base = baseIndex.recipes.get(recipe.id) ?? recipe
  const lines = statLines(base, recipeTotals(baseIndex, state.profile, base, state.options.bonuses))
  if (!lines.length) return null
  const sec = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const fmt = (unit: string, v: number) => (unit === 'ms' ? `${sec.format(v / 1000)} s` : unit === 'pct' ? `${num.format(v * 100)} %` : num.format(v))
  return (
    <section className="lv-list">
      <div className="lv-sec-title">{t('live.values')}</div>
      <table className="lv-table">
        <thead>
          <tr>
            <th />
            <th>{t('live.base')}</th>
            <th>{t('live.withBonus')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const gain = l.lower ? l.base - l.now : l.now - l.base
            return (
              <tr key={l.label}>
                <td title={t(l.label)}>{t(l.label)}</td>
                <td className="num">{fmt(l.unit, l.base)}</td>
                <td className={`num ${gain > 1e-9 ? 'up' : gain < -1e-9 ? 'down' : ''}`}>{fmt(l.unit, l.now)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** Boni, die auf die laufende Aktion wirken — mit Quelle */
function ActionBonuses({ recipe }: { recipe: Recipe }) {
  const { index, bonus, state } = useGame()
  const { t } = useI18n()
  const list = bonus.perRecipe.get(recipe.id) ?? []
  const entityOf = (s: (typeof list)[number]['source']) =>
    s.kind === 'purchase' ? `purchase:${s.id}` : s.kind === 'item' ? `item:${s.id}` : s.skill ? `skill:${s.skill}` : null
  return (
    <section className="lv-list">
      <div className="lv-sec-title">{t('live.bonuses')}</div>
      {!state.options.bonuses ? (
        <p className="muted">{t('live.bonusesOff')}</p>
      ) : list.length === 0 ? (
        <p className="muted">{t('live.noBonuses')}</p>
      ) : (
        list.map((a, i) => (
          <div key={i} className="lv-row" title={modScope(index, a.mod, t)}>
            <GameIcon src={a.source.icon ?? (a.source.skill ? index.skills.get(a.source.skill)?.icon : null)} size={22} entity={entityOf(a.source)} />
            <span className="grow">
              <b>
                {modValue(a.mod, a.value)} {modLabel(a.mod, t)}
              </b>
              <span className="muted">
                <Ref entity={entityOf(a.source)}>{a.source.name}</Ref>
                {!a.supported && ` · ${t('bonus.notCounted')}`}
              </span>
            </span>
          </div>
        ))
      )}
    </section>
  )
}
