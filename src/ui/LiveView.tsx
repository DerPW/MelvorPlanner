// Live: alles zur laufenden Aktion auf einer Seite — was läuft, wie schnell,
// was es bringt und verbraucht, wann das Material ausgeht, und wo die
// verfolgte Route steht. Restzeiten zählen zwischen den Spielständen mit.

import { useState } from 'react'
import { xpForLevel } from '../core/experience'
import { liveStock } from '../core/live'
import { fmtDurationShort, fmtInt } from '../core/format'
import { useI18n } from '../i18n'
import { GameIcon, Sym, Toolbar, useNow } from './components'
import { leftNow, Measuring, StepBar, statusLine, totalLeft, useTrack } from './LiveTrack'
import { routeIcon, routeLabel } from './routeText'
import { useGame } from './state'

export function LiveView() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
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
            <h2>{action ? action.action || action.entity : t('track.nothing')}</h2>
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
            {nextMs !== null && <Tile label={t('live.nextLevel', { level: (level ?? 1) + 1 })} value={fmtDurationShort(nextMs)} />}
            {rates.goldPerHour > 1 && <Tile label={t('live.goldRate')} value={`${fmtInt(rates.goldPerHour)} GP/h`} tone="gold" />}
            {stopMs !== null && <Tile label={t('live.stopsIn')} value={fmtDurationShort(stopMs) || t('live.now')} tone={stopMs < 600_000 ? 'warn' : undefined} />}
            <Tile label={t('live.since')} value={fmtDurationShort(now - rates.since)} />
          </div>
        )}

        {flow && (flow.gains.length > 0 || flow.uses.length > 0) && (
          <div className="lv-cols">
            {/* Bestände sekündlich weitergerechnet, beim nächsten Spielstand korrigiert */}
            <FlowList title={t('live.gains')} rows={flow.gains.map((g) => ({ ...g, stock: liveStock(g.stock, g.perHour, lastAt, now), sign: '+' }))} />
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

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'warn' }) {
  return (
    <div className={`lv-tile ${tone ?? ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

/** Gewinn bzw. Verbrauch je Stunde, mit Bestand; beim Verbrauch, wann er leer ist */
function FlowList({ title, rows, empty }: { title: string; empty?: string; rows: { item: string; perHour: number; stock: number; sign: string; emptyMs?: number; first?: boolean }[] }) {
  const { index } = useGame()
  const { t } = useI18n()
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
            {r.emptyMs !== undefined && <span className={r.first ? 'warn' : 'muted'}>{t('live.emptyIn', { time: fmtDurationShort(r.emptyMs) || t('live.now') })}</span>}
          </span>
        </div>
      ))}
    </section>
  )
}
