import { useMemo, useState } from 'react'
import { MAX_LEVEL, xpForLevel } from '../core/experience'
import { fmtInt } from '../core/format'
import { unlockReqFor } from '../core/planner'
import { GP } from '../core/route'
import { useI18n, type LangSetting } from '../i18n'
import { modLabel, modScope, modValue } from './bonusText'
import { GameIcon, Ref, Select, Stepper, Switch, Sym, Toolbar } from './components'
import { ItemSearch } from './ItemSearch'
import { useLive } from './LiveSync'
import { featureLock } from './SolutionView'
import { useGame } from './state'
import { useUi } from './ui'

export function ProfileView() {
  const { index, baseIndex, bonus, state, dispatch } = useGame()
  const { t, locale, setting, setSetting } = useI18n()
  const p = state.profile
  const [unlockFilter, setUnlockFilter] = useState('')
  const { openImport } = useUi()
  const skills = index.data.skills
  const unlocks = useMemo(
    () =>
      index.data.purchases
        .filter((x) => !x.items.length && !x.demoLocked)
        .filter(
          (x) =>
            !unlockFilter ||
            x.name.toLowerCase().includes(unlockFilter.toLowerCase()) ||
            (x.category ?? '').toLowerCase().includes(unlockFilter.toLowerCase()),
        ),
    [index, unlockFilter],
  )
  const gp = index.currencies.get(GP)
  const live = useLive()
  const time = (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' })
  const setOption = (o: Partial<typeof state.options>) => dispatch({ type: 'setOption', options: o })

  return (
    <>
      <Toolbar
        title={t('profile.title')}
        subtitle={
          p.source
            ? t('profile.fromSave', {
                name: p.source.character,
                time: p.source.savedAt ? new Date(p.source.savedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—',
              })
            : t('profile.subtitle')
        }
      >
        <button className="btn plain" onClick={() => confirm(t('profile.resetConfirm')) && dispatch({ type: 'resetProfile' })}>
          <Sym name="reset" size={13} /> {t('common.reset')}
        </button>
        <button className="btn primary" onClick={openImport}>
          {t('import.button')}
        </button>
      </Toolbar>
      <div className="content narrow-content">
        <div className="group-title">
          {t('live.title')} <span className="muted">{t('live.subtitle')}</span>
        </div>
        <div className="form-group">
          {live.saves === null && <div className="form-row muted">{t('live.unavailable')}</div>}
          {live.saves?.length === 0 && <div className="form-row muted">{t('live.none')}</div>}
          {live.saves?.map((f) => {
            const h = live.headers[f.name]
            const on = state.live?.save === f.name
            return (
              <div className="form-row" key={f.name}>
                <GameIcon src="game/icons/Icons/Bank.webp" size={22} />
                <span className="grow">
                  {h ? h.character || t('live.unnamed') : f.name}
                  {h && (
                    <span className="muted">
                      {' '}
                      · {h.gamemode}
                      {h.isDemo ? ' · Demo' : ''} · {t('live.totalLevel', { n: Object.values(h.levels).reduce((a, b) => a + b, 0) })}
                    </span>
                  )}
                  <div className="hint">{t('live.saved', { time: time(f.mtime) })}</div>
                </span>
                {on && (
                  <span className={`live-badge ${live.error ? 'warn' : ''}`}>
                    <i /> {live.busy ? t('live.reading') : 'live'}
                  </span>
                )}
                <Switch label={t('live.toggle')} checked={on} onChange={(v) => dispatch({ type: 'setLive', save: v ? f.name : null })} />
              </div>
            )
          })}
        </div>
        {state.live && (
          <p className="form-caption">
            {live.error
              ? t('live.failed', { reason: live.error })
              : live.lastSync
                ? t('live.synced', { time: time(live.lastSync) })
                : t('live.reading')}
          </p>
        )}

        <div className="group-title">{t('profile.general')}</div>
        <div className="form-group">
          <div className="form-row">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden style={{ color: 'var(--accent)' }}>
              <circle cx="8" cy="8" r="6" />
              <path d="M2 8h12M8 2c2 2 2.6 4 2.6 6S10 12 8 14M8 2C6 4 5.4 6 5.4 8S6 12 8 14" />
            </svg>
            <span className="grow">
              {t('lang.label')}
              <div className="hint">{t('lang.hint')}</div>
            </span>
            <Select label={t('lang.label')} value={setting} onChange={(v) => setSetting(v as LangSetting)}>
              <option value="auto">{t('lang.auto')}</option>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </Select>
          </div>
          <div className="form-row">
            <GameIcon src={gp?.icon} size={22} />
            <span className="grow">{t('sum.gold')}</span>
            <Stepper label={t('sum.gold')} value={p.currencies[GP] ?? 0} step={1000} onChange={(qty) => dispatch({ type: 'setCurrency', currency: GP, qty })} />
          </div>
          <div className="form-row">
            <GameIcon src={index.skills.get('MelvorBase:Farming')?.icon} size={22} entity="skill:MelvorBase:Farming" />
            <span className="grow">
              {t('profile.plots')}
              <div className="hint">{t('profile.plots.hint')}</div>
            </span>
            <Stepper narrow label={t('profile.plots')} value={p.farmingPlots ?? 1} min={1} max={60} onChange={(plots) => dispatch({ type: 'setPlots', plots })} />
          </div>
          <div className="form-row">
            <Sym name="box" size={20} />
            <span className="grow">
              {t('opt.materials')}
              <div className="hint">{t('opt.materials.off')}</div>
            </span>
            <Switch label={t('opt.materials')} checked={state.options.includeMaterials} onChange={(includeMaterials) => setOption({ includeMaterials })} />
          </div>
          <div className="form-row">
            <Sym name="plus" size={20} />
            <span className="grow">
              {t('opt.bonuses')}
              <div className="hint">{state.options.bonuses ? t('opt.bonuses.on', { n: bonus.active.length }) : t('opt.bonuses.off')}</div>
            </span>
            <Switch label={t('opt.bonuses')} checked={state.options.bonuses} onChange={(bonuses) => setOption({ bonuses })} />
          </div>
          <div className="form-row">
            <Sym name="tree" size={20} />
            <span className="grow">
              {t('opt.smart')}
              <div className="hint">{t('opt.smart.hint')}</div>
            </span>
            <Switch label={t('opt.smart')} checked={state.options.smart} onChange={(smart) => setOption({ smart })} />
          </div>
        </div>

        <div className="group-title">
          {t('nav.skills')}{' '}
          <span className="muted">{p.levelCap && p.levelCap < MAX_LEVEL ? t('profile.levelCap', { cap: p.levelCap }) : ''}</span>
        </div>
        <div className="form-group skill-grid">
          {skills.map((s) => {
            const level = p.levels[s.id] ?? 1
            const lockable = unlockReqFor(index, s.id)
            const locked = !!featureLock(index, p, s.id)
            const manual = p.unlocked?.[s.id] !== undefined
            return (
              <div className={`form-row ${locked ? 'locked' : ''}`} key={s.id}>
                <GameIcon src={s.icon} size={22} entity={`skill:${s.id}`} />
                <span className="grow">
                  <Ref entity={`skill:${s.id}`}>{s.name}</Ref>
                  <div className="hint">
                    {locked ? t('lock.short') : `${fmtInt(p.xp?.[s.id] ?? xpForLevel(level))} XP`}
                    {manual && <span className="muted"> · {t('lock.manual')}</span>}
                  </div>
                </span>
                {lockable && !lockable.demoLocked && (
                  <button
                    className={`icon-btn lock-toggle ${locked ? 'on' : ''}`}
                    title={t(locked ? 'lock.markOpen' : 'lock.markLocked')}
                    aria-label={t(locked ? 'lock.markOpen' : 'lock.markLocked')}
                    onClick={() => dispatch({ type: 'setUnlocked', feature: s.id, unlocked: locked })}
                    onContextMenu={(e) => {
                      if (!manual) return
                      e.preventDefault()
                      dispatch({ type: 'setUnlocked', feature: s.id, unlocked: null })
                    }}
                  >
                    <Sym name={locked ? 'lock' : 'unlock'} size={13} />
                  </button>
                )}
                <Stepper
                  narrow
                  label={`${s.name} Level`}
                  value={level}
                  min={1}
                  max={p.levelCap ?? MAX_LEVEL}
                  onChange={(lv) => dispatch({ type: 'setLevel', skill: s.id, level: lv })}
                />
              </div>
            )
          })}
        </div>

        <div className="group-title">
          {t('guild.title')} <span className="muted">{t('guild.subtitle')}</span>
        </div>
        <div className="form-group skill-grid">
          {Object.entries(baseIndex.data.guildRanks ?? {}).map(([skill, ranks]) => {
            const s = index.skills.get(skill)
            if (!s) return null
            return (
              <div className="form-row" key={skill}>
                <GameIcon src={s.icon} size={22} entity={`skill:${skill}`} />
                <span className="grow">
                  <Ref entity={`skill:${skill}`}>{s.name}</Ref>
                </span>
                <Select
                  label={t('guild.rankOf', { skill: s.name })}
                  value={String(p.guildRanks?.[skill] ?? 0)}
                  onChange={(v) => dispatch({ type: 'setGuildRank', skill, rank: Number(v) })}
                >
                  {ranks.map((r, i) => {
                    // „Cooking Initiate" / „Apprentice Woodcutter" → „Initiate" / „Apprentice"
                    const words = r.name.split(' ')
                    const short = words[0] === s.name ? words.slice(1).join(' ') : words[0]
                    return (
                      <option key={r.id} value={i}>
                        {i + 1} · {short}
                      </option>
                    )
                  })}
                </Select>
              </div>
            )
          })}
        </div>

        {bonus.active.length > 0 && (
          <>
            <div className="group-title">
              {t('bonus.title')} <span className="muted">{t('bonus.subtitle')}</span>
            </div>
            <div className="form-group">
              {bonus.active.map(({ source, count }) => (
                <div className="form-row bonus-row" key={`${source.kind}:${source.id}`}>
                  <GameIcon
                    src={source.icon ?? (source.skill ? index.skills.get(source.skill)?.icon : null)}
                    size={22}
                    entity={source.kind === 'purchase' ? `purchase:${source.id}` : source.kind === 'item' ? `item:${source.id}` : source.skill ? `skill:${source.skill}` : null}
                  />
                  <span className="grow">
                    <Ref entity={source.kind === 'purchase' ? `purchase:${source.id}` : source.kind === 'item' ? `item:${source.id}` : source.skill ? `skill:${source.skill}` : null}>{source.name}</Ref>
                    {count > 1 && <span className="muted"> ×{count}</span>}
                    <div className="bonus-mods">
                      {source.mods.map((m, i) => (
                        <span key={i} title={modScope(index, m, t)}>
                          <b>{modValue(m, m.value * count)}</b> {modLabel(m, t)}
                          <span className="muted"> · {modScope(index, m, t)}</span>
                        </span>
                      ))}
                    </div>
                  </span>
                  <span className="tag std">{t(`bonus.kind.${source.kind}`)}</span>
                </div>
              ))}
            </div>
            <p className="form-caption">{t('bonus.missing')}</p>
          </>
        )}

        <div className="group-title" style={{ justifyContent: 'space-between' }}>
          <span>
            {t('stock.title')} <span className="muted">{t('stock.count', { n: Object.keys(p.inventory).length })}</span>
          </span>
          <ItemSearch
            placeholder={t('stock.add')}
            width={220}
            onPick={(item) => dispatch({ type: 'setStock', item, qty: (p.inventory[item] ?? 0) + 1 })}
          />
        </div>
        <div className="form-group">
          {Object.keys(p.inventory).length === 0 && <div className="form-row muted">{t('stock.empty')}</div>}
          {Object.entries(p.inventory).map(([id, n]) => {
            const item = index.items.get(id)
            return (
              <div className="form-row" key={id}>
                <GameIcon src={item?.icon} size={22} entity={`item:${id}`} />
                <span className="grow" data-entity={`item:${id}`}>
                  {item?.name ?? id}
                </span>
                <Stepper label={t('stock.qty')} value={n} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
                <button className="icon-btn" aria-label={t('common.remove')} onClick={() => dispatch({ type: 'setStock', item: id, qty: 0 })}>
                  <Sym name="close" size={13} />
                </button>
              </div>
            )
          })}
        </div>

        {p.equipped && p.equipped.length > 0 && (
          <>
            <div className="group-title">{t('toolbelt.title')}</div>
            <div className="form-group">
              {p.equipped.map((id) => (
                <div className="form-row" key={id}>
                  <GameIcon src={index.items.get(id)?.icon} size={22} entity={`item:${id}`} />
                  <span className="grow">{index.items.get(id)?.name ?? id}</span>
                  <span className="muted">{t('toolbelt.equipped')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="group-title" style={{ justifyContent: 'space-between' }}>
          <span>
            {t('unlocks.title')} <span className="muted">{t('unlocks.count', { n: Object.keys(p.owned).length })}</span>
          </span>
          <div className="search" style={{ width: 220 }}>
            <Sym name="search" size={15} className="sym-lead" />
            <input value={unlockFilter} placeholder={t('unlocks.filter')} onChange={(e) => setUnlockFilter(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          {unlocks.map((u) => (
            <div className="form-row" key={u.id}>
              <GameIcon src={u.icon} size={22} entity={`purchase:${u.id}`} />
              <span className="grow">
                <Ref entity={`purchase:${u.id}`}>{u.name}</Ref>
                <div className="hint">
                  {u.category}
                  {u.costs.map((c) => ` · ${fmtInt(c.qty)} ${index.currencies.get(c.currency)?.short ?? ''}`)}
                </div>
              </span>
              <Switch label={u.name} checked={p.owned[u.id] > 0} onChange={(owned) => dispatch({ type: 'setOwned', purchase: u.id, owned })} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
