import { useMemo, useState } from 'react'
import { MAX_LEVEL, xpForLevel } from '../core/experience'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import { modLabel, modScope, modValue } from './bonusText'
import { GameIcon, Select, Stepper, Switch, Sym, Toolbar } from './components'
import { ImportSheet } from './ImportSheet'
import { ItemSearch } from './ItemSearch'
import { useLive } from './LiveSync'
import { useGame } from './state'

export function ProfileView() {
  const { index, baseIndex, bonus, state, dispatch } = useGame()
  const p = state.profile
  const [unlockFilter, setUnlockFilter] = useState('')
  const [importing, setImporting] = useState(false)
  const skills = index.data.skills
  const unlocks = useMemo(
    () =>
      index.data.purchases
        .filter((x) => !x.items.length && !x.demoLocked)
        .filter((x) => !unlockFilter || x.name.toLowerCase().includes(unlockFilter.toLowerCase()) || (x.category ?? '').toLowerCase().includes(unlockFilter.toLowerCase())),
    [index, unlockFilter],
  )
  const gp = index.currencies.get(GP)
  const live = useLive()
  const time = (ms: number) => new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })

  return (
    <>
      <Toolbar
        title="Profil"
        subtitle={
          p.source
            ? `Aus dem Spielstand „${p.source.character}"${p.source.savedAt ? ` · gespeichert ${new Date(p.source.savedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
            : 'Dein Stand — alle Pläne rechnen von hier aus'
        }
      >
        <button className="btn plain" onClick={() => confirm('Profil auf Anfang zurücksetzen?') && dispatch({ type: 'resetProfile' })}>
          <Sym name="reset" size={13} /> Zurücksetzen
        </button>
        <button className="btn primary" onClick={() => setImporting(true)}>
          Spielstand importieren
        </button>
      </Toolbar>
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      <div className="content narrow-content">
        <div className="group-title">
          Live-Verbindung <span className="muted">liest den Spielstand neu ein, sobald das Spiel speichert</span>
        </div>
        <div className="form-group">
          {live.saves === null && (
            <div className="form-row muted">Nur verfügbar, wenn der Planer lokal mit „pnpm dev" läuft — dann in jedem Browser.</div>
          )}
          {live.saves?.length === 0 && (
            <div className="form-row muted">Kein Spielstand gefunden unter ~/Library/Application Support/Games By Malcs/Melvor Idle 2.</div>
          )}
          {live.saves?.map((f) => {
            const h = live.headers[f.name]
            const on = state.live?.save === f.name
            return (
              <div className="form-row" key={f.name}>
                <GameIcon src="game/icons/Icons/Bank.webp" size={22} />
                <span className="grow">
                  {h ? h.character || 'Ohne Namen' : f.name}
                  {h && (
                    <span className="muted">
                      {' '}
                      · {h.gamemode}
                      {h.isDemo ? ' · Demo' : ''} · {Object.values(h.levels).reduce((a, b) => a + b, 0)} Gesamtlevel
                    </span>
                  )}
                  <div className="hint">gespeichert {time(f.mtime)}</div>
                </span>
                {on && <span className={`live-badge ${live.error ? 'warn' : ''}`}><i /> {live.busy ? 'liest …' : 'live'}</span>}
                <Switch label="Live mitlesen" checked={on} onChange={(v) => dispatch({ type: 'setLive', save: v ? f.name : null })} />
              </div>
            )
          })}
        </div>
        {state.live && (
          <p className="form-caption">
            {live.error
              ? `Zuletzt fehlgeschlagen: ${live.error} — nächster Versuch in ein paar Sekunden.`
              : live.lastSync
                ? `Zuletzt übernommen ${time(live.lastSync)}. Gilden-Rang und Felder bleiben, wie du sie eingestellt hast.`
                : 'Wird gelesen …'}
          </p>
        )}

        <div className="group-title">Allgemein</div>
        <div className="form-group">
          <div className="form-row">
            <GameIcon src={gp?.icon} size={22} />
            <span className="grow">Gold</span>
            <Stepper label="Gold" value={p.currencies[GP] ?? 0} step={1000} onChange={(qty) => dispatch({ type: 'setCurrency', currency: GP, qty })} />
          </div>
          <div className="form-row">
            <GameIcon src={index.skills.get('MelvorBase:Farming')?.icon} size={22} />
            <span className="grow">
              Farming-Felder
              <div className="hint">wachsen gleichzeitig — teilt die Wartezeit</div>
            </span>
            <Stepper narrow label="Felder" value={p.farmingPlots ?? 1} min={1} max={60} onChange={(plots) => dispatch({ type: 'setPlots', plots })} />
          </div>
          <div className="form-row">
            <Sym name="box" size={20} />
            <span className="grow">
              Material fürs Training selbst beschaffen
              <div className="hint">aus: Routen rechnen nur die Aktionszeit</div>
            </span>
            <Switch
              label="Material selbst beschaffen"
              checked={state.options.includeMaterials}
              onChange={(includeMaterials) => dispatch({ type: 'setOption', options: { includeMaterials } })}
            />
          </div>
          <div className="form-row">
            <Sym name="plus" size={20} />
            <span className="grow">
              Boni einrechnen
              <div className="hint">
                {state.options.bonuses
                  ? `${bonus.active.length} aktiv — Shop-Käufe, Werkzeuge, Gilden-Ränge`
                  : 'aus: Grundwerte wie im Spiel ohne Upgrades'}
              </div>
            </span>
            <Switch label="Boni einrechnen" checked={state.options.bonuses} onChange={(bonuses) => dispatch({ type: 'setOption', options: { bonuses } })} />
          </div>
        </div>

        <div className="group-title">
          Skills <span className="muted">{p.levelCap && p.levelCap < MAX_LEVEL ? `höchstens Level ${p.levelCap} in dieser Version` : ''}</span>
        </div>
        <div className="form-group skill-grid">
          {skills.map((s) => {
            const level = p.levels[s.id] ?? 1
            return (
              <div className="form-row" key={s.id}>
                <GameIcon src={s.icon} size={22} />
                <span className="grow">
                  {s.name}
                  <div className="hint">{fmtInt(p.xp?.[s.id] ?? xpForLevel(level))} XP</div>
                </span>
                <Stepper narrow label={`${s.name} Level`} value={level} min={1} max={p.levelCap ?? MAX_LEVEL} onChange={(lv) => dispatch({ type: 'setLevel', skill: s.id, level: lv })} />
              </div>
            )
          })}
        </div>

        <div className="group-title">
          Meisterschafts-Gilde <span className="muted">Rang je Skill — schaltet Gilden-Boni frei</span>
        </div>
        <div className="form-group skill-grid">
          {Object.entries(baseIndex.data.guildRanks ?? {}).map(([skill, ranks]) => {
            const s = index.skills.get(skill)
            if (!s) return null
            return (
              <div className="form-row" key={skill}>
                <GameIcon src={s.icon} size={22} />
                <span className="grow">{s.name}</span>
                <Select
                  label={`${s.name} Gilden-Rang`}
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
              Aktive Boni <span className="muted">gehen in alle Zeiten, Mengen und Raten ein</span>
            </div>
            <div className="form-group">
              {bonus.active.map(({ source, count }) => (
                <div className="form-row bonus-row" key={`${source.kind}:${source.id}`}>
                  <GameIcon src={source.icon ?? (source.skill ? index.skills.get(source.skill)?.icon : null)} size={22} />
                  <span className="grow">
                    {source.name}
                    {count > 1 && <span className="muted"> ×{count}</span>}
                    <div className="bonus-mods">
                      {source.mods.map((m, i) => (
                        <span key={i} title={modScope(index, m)}>
                          <b>{modValue(m, m.value * count)}</b> {modLabel(m)}
                          <span className="muted"> · {modScope(index, m)}</span>
                        </span>
                      ))}
                    </div>
                  </span>
                  <span className="tag std">{source.kind === 'purchase' ? 'Shop' : source.kind === 'item' ? 'Werkzeug' : 'Gilde'}</span>
                </div>
              ))}
            </div>
            <p className="form-caption">
              Noch nicht dabei: Tränke, Astrologie, Haustiere und angelegte Ausrüstung. Werte, die der Planer nicht modelliert
              (z. B. Vogelnester beim Holzfällen), stehen in der Skill-Ansicht als „nicht gerechnet".
            </p>
          </>
        )}

        <div className="group-title" style={{ justifyContent: 'space-between' }}>
          <span>
            Lager <span className="muted">{Object.keys(p.inventory).length} Items</span>
          </span>
          <ItemSearch placeholder="Item ins Lager" width={220} onPick={(item) => dispatch({ type: 'setStock', item, qty: (p.inventory[item] ?? 0) + 1 })} />
        </div>
        <div className="form-group">
          {Object.keys(p.inventory).length === 0 && <div className="form-row muted">Leer. Was im Lager liegt, zieht der Plan vom Bedarf ab.</div>}
          {Object.entries(p.inventory).map(([id, n]) => {
            const item = index.items.get(id)
            return (
              <div className="form-row" key={id}>
                <GameIcon src={item?.icon} size={22} />
                <span className="grow">{item?.name ?? id}</span>
                <Stepper label="Menge" value={n} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
                <button className="icon-btn" aria-label="Entfernen" onClick={() => dispatch({ type: 'setStock', item: id, qty: 0 })}>
                  <Sym name="close" size={13} />
                </button>
              </div>
            )
          })}
        </div>

        {p.equipped && p.equipped.length > 0 && (
          <>
            <div className="group-title">Werkzeuggürtel</div>
            <div className="form-group">
              {p.equipped.map((id) => (
                <div className="form-row" key={id}>
                  <GameIcon src={index.items.get(id)?.icon} size={22} />
                  <span className="grow">{index.items.get(id)?.name ?? id}</span>
                  <span className="muted">ausgerüstet</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="group-title" style={{ justifyContent: 'space-between' }}>
          <span>
            Freischaltungen <span className="muted">{Object.keys(p.owned).length} gekauft</span>
          </span>
          <div className="search" style={{ width: 220 }}>
            <Sym name="search" size={15} className="sym-lead" />
            <input value={unlockFilter} placeholder="Filtern" onChange={(e) => setUnlockFilter(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          {unlocks.map((u) => (
            <div className="form-row" key={u.id}>
              <GameIcon src={u.icon} size={22} />
              <span className="grow">
                {u.name}
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
