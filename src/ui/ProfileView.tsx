import { useMemo, useState } from 'react'
import { MAX_LEVEL, xpForLevel } from '../core/experience'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import { GameIcon, Stepper, Switch, Sym, Toolbar } from './components'
import { ImportSheet } from './ImportSheet'
import { ItemSearch } from './ItemSearch'
import { useGame } from './state'

export function ProfileView() {
  const { index, state, dispatch } = useGame()
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
