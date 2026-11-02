// Detailseiten: Item, Monster, Gebiet, Shop-Kauf — alles, was die Spieldaten
// darüber wissen, und überall verlinkt (Klick öffnet, Rechtsklick = Menü).

import type { ReactNode } from 'react'
import { fmtDurationShort, fmtInt, fmtNum } from '../core/format'
import { actionTime, rankSources, unmetReqs, yieldOf } from '../core/planner'
import { GP } from '../core/route'
import type { Id, InfoSource, Mod, NamedValue, Req } from '../core/types'
import { useI18n } from '../i18n'
import { modLabel, modScope, modValue } from './bonusText'
import { GameIcon, LevelTag, Stepper, Switch, Sym, Toolbar } from './components'
import { recipeAction } from './SolutionView'
import { newId, useGame, type DetailType } from './state'

export function DetailView({ type, id }: { type: DetailType; id: Id }) {
  if (type === 'item') return <ItemDetail id={id} />
  if (type === 'enemy') return <EnemyDetail id={id} />
  if (type === 'area') return <AreaDetail id={id} />
  return <PurchaseDetail id={id} />
}

// --- Bausteine

/** Verweis auf etwas mit eigener Seite: Klick öffnet, Rechtsklick/Hover via data-entity */
export function EntityLink({ type, id, icon, name, size = 18 }: { type: DetailType; id: Id; icon?: string | null; name: string; size?: number }) {
  const { dispatch } = useGame()
  return (
    <button className="entity-link" data-entity={`${type}:${id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type, id } })}>
      <GameIcon src={icon} size={size} />
      <span>{name}</span>
    </button>
  )
}

function ItemLink({ id, qty }: { id: Id; qty?: string }) {
  const { index } = useGame()
  const item = index.items.get(id)
  return (
    <span className="item-ref">
      {qty && <span className="qty">{qty}</span>}
      <EntityLink type="item" id={id} icon={item?.icon} name={item?.name ?? id} size={16} />
    </span>
  )
}

function DetailToolbar({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  const { state, dispatch } = useGame()
  const { t } = useI18n()
  return (
    <Toolbar title={title} subtitle={subtitle} onBack={state.history.length ? () => dispatch({ type: 'back' }) : undefined} backLabel={t('detail.back')}>
      {children}
    </Toolbar>
  )
}

function Hero({ icon, title, text, chips, children }: { icon?: string | null; title: string; text?: string | null; chips?: ReactNode; children?: ReactNode }) {
  return (
    <div className="hero">
      <div className="hero-icon">
        <GameIcon src={icon} size={64} />
      </div>
      <div className="hero-body">
        <h2>{title}</h2>
        {text && <p>{text}</p>}
        {chips && <div className="hero-chips">{chips}</div>}
      </div>
      {children && <div className="hero-actions">{children}</div>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <div className="group-title">
        {title} {hint && <span className="muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Mods({ mods }: { mods: Mod[] }) {
  const { index } = useGame()
  const { t } = useI18n()
  return (
    <div className="form-group">
      {mods.map((m, i) => (
        <div className="form-row" key={i}>
          <span className="grow">
            <b className="ok">{modValue(m)}</b> {modLabel(m, t)}
            <div className="hint">{modScope(index, m, t)}</div>
          </span>
        </div>
      ))}
    </div>
  )
}

function Stats({ rows }: { rows: NamedValue[] }) {
  const { t } = useI18n()
  return (
    <div className="stat-grid">
      {rows.map((r) => (
        <div key={r.name} className="stat">
          <span>{t(`cstat.${r.name}`) === `cstat.${r.name}` ? r.name.replace(/([a-z])([A-Z])/g, '$1 $2') : t(`cstat.${r.name}`)}</span>
          <b>{r.name === 'AttackInterval' ? `${fmtNum(r.value / 1000)} s` : fmtNum(r.value)}</b>
        </div>
      ))}
    </div>
  )
}

function Reqs({ reqs }: { reqs: Req[] }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  if (!reqs.length) return null
  return (
    <div className="chips">
      {reqs.map((q, i) =>
        q.type === 'level' ? (
          <span key={i} className="chip">
            <GameIcon src={index.skills.get(q.skill)?.icon} size={14} /> {index.skills.get(q.skill)?.name}
            <LevelTag level={q.level} have={state.profile.levels[q.skill] ?? 1} />
          </span>
        ) : q.type === 'purchase' ? (
          <EntityLink key={i} type="purchase" id={q.purchase} icon={index.purchases.get(q.purchase)?.icon} name={q.name} size={14} />
        ) : q.type === 'item' ? (
          <ItemLink key={i} id={q.item} />
        ) : (
          <span key={i} className="chip muted" title={t('sum.uncheckedHint')}>
            {q.text}
          </span>
        ),
      )}
    </div>
  )
}

const pct = (n: number) => (n >= 0.1 ? `${fmtNum(Math.round(n * 1000) / 10)} %` : n >= 0.001 ? `${fmtNum(Math.round(n * 10000) / 100)} %` : `1/${fmtInt(1 / n)}`)
const range = (a: number, b: number) => (a === b ? fmtInt(a) : `${fmtInt(a)}–${fmtInt(b)}`)

// --- Item

function ItemDetail({ id }: { id: Id }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const item = index.items.get(id)
  if (!item) return <Missing />

  const goal = state.items.find((g) => g.item === id)
  const stock = state.profile.inventory[id] ?? 0
  const sources = rankSources(index, id, state.profile)
  const chosen = state.choices[id]
  const current = (chosen && sources.find((r) => r.id === chosen)) || sources[0]
  const info = (index.data.infoSources ?? []).filter((s) => s.item === id)
  const usedIn = (index.consumers.get(id) ?? []).filter((r) => !r.demoLocked)
  const neededBy = index.data.purchases.filter((p) => p.inputs.some((i) => i.item === id) && !p.demoLocked)
  const toolFor = index.data.recipes.filter((r) => !r.demoLocked && r.reqs.some((q) => q.type === 'item' && q.item === id))
  const tags = (item.bankTags ?? []).map((b) => ({ ...b, skill: index.skills.get(b.tag) }))

  return (
    <>
      <DetailToolbar title={item.name} subtitle={t('detail.item')} />
      <div className="content narrow-content">
        <Hero
          icon={item.icon}
          title={item.name}
          text={item.description}
          chips={
            <>
              {item.sells && (
                <span className="chip">
                  <GameIcon src={index.currencies.get(item.sells.currency)?.icon} size={14} /> {fmtInt(item.sells.qty)} · {t('insp.sells')}
                </span>
              )}
              {tags
                .filter((x) => x.product)
                .map((x) => (
                  <span key={x.tag} className="chip" title={t('detail.madeIn')}>
                    {x.skill && <GameIcon src={x.skill.icon} size={14} />} {x.skill?.name ?? x.tag.replace(/^MelvorBase:/, '')}
                  </span>
                ))}
            </>
          }
        >
          {goal ? (
            <div className="hero-goal">
              <span className="muted">{t('detail.inPlan')}</span>
              <Stepper label={t('insp.goalQty')} value={goal.qty} min={1} onChange={(qty) => dispatch({ type: 'setItemQty', item: id, qty })} />
              <button className="btn plain small danger" onClick={() => dispatch({ type: 'removeItem', item: id })}>
                {t('common.remove')}
              </button>
            </div>
          ) : (
            <button className="btn primary" onClick={() => dispatch({ type: 'addItem', item: id })}>
              <Sym name="plus" size={13} /> {t('detail.addToPlan')}
            </button>
          )}
          <div className="hero-goal">
            <span className="muted">{t('insp.inStock')}</span>
            <Stepper label={t('insp.inStock')} value={stock} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
          </div>
        </Hero>

        <Section title={t('insp.sources')} hint={sources.length ? t('detail.sourcesHint') : undefined}>
          {sources.length === 0 ? (
            <p className="muted">{t('detail.noRecipe')}</p>
          ) : (
            <table className="table">
              <colgroup>
                <col style={{ width: 30 }} />
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 96 }} />
                <col className="hide-narrow" style={{ width: '32%' }} />
              </colgroup>
              <tbody>
                {sources.map((r) => {
                  const per = yieldOf(r, id, state.profile)
                  const ms = per > 0 ? actionTime(r, state.profile) / per : 0
                  const skill = r.skill ? index.skills.get(r.skill) : null
                  const unmet = unmetReqs(r.reqs, state.profile).filter((q) => q.type !== 'level')
                  return (
                    <tr key={r.id} className={r.demoLocked ? 'dim' : ''} onClick={() => dispatch({ type: 'choose', item: id, recipe: r.id })}>
                      <td>
                        <span className={`radio ${current?.id === r.id ? 'on' : ''}`} />
                      </td>
                      <td>
                        <div className="cell-source">
                          <GameIcon src={skill?.icon ?? r.icon} size={18} />
                          <span className="name">{recipeAction(t, r)}</span>
                          {r.demoLocked && <span className="tag locked">Demo</span>}
                          {unmet.length > 0 && <span className="tag warn">{t('insp.needs', { name: unmet.map((q) => (q.type === 'purchase' ? q.name : q.type === 'item' ? index.items.get(q.item)?.name : '')).join(', ') })}</span>}
                        </div>
                      </td>
                      <td>
                        <LevelTag level={Math.max(1, r.level)} have={r.skill ? (state.profile.levels[r.skill] ?? 1) : 1} />
                      </td>
                      <td className="num">{ms > 0 ? t('insp.perUnit', { time: fmtDurationShort(ms) }) : t('flow.instant')}</td>
                      <td className="hide-narrow">
                        <span className="ingredients">
                          {r.costs.map((c) => (
                            <span key={c.currency} className="gold">
                              <GameIcon src={index.currencies.get(c.currency)?.icon} size={14} /> {fmtInt(c.qty)}
                            </span>
                          ))}
                          {r.inputs.map((i) => (
                            <span key={i.item} data-entity={`item:${i.item}`}>
                              <GameIcon src={index.items.get(i.item)?.icon} size={16} /> {fmtNum(i.qty)}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {info.length > 0 && <InfoSources rows={info} />}

        {usedIn.length > 0 && (
          <Section title={t('insp.usedFor')} hint={t('detail.recipes', { n: usedIn.length })}>
            <table className="table">
              <colgroup>
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <tbody>
                {usedIn.map((r) => {
                  const out = r.outputs[0]?.item
                  const need = r.inputs.find((i) => i.item === id)?.qty ?? 0
                  const skill = r.skill ? index.skills.get(r.skill) : null
                  return (
                    <tr key={r.id} data-entity={out ? `item:${out}` : undefined} onClick={() => out && dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: out } })}>
                      <td>
                        <div className="cell-source">
                          <GameIcon src={index.items.get(out)?.icon ?? r.icon} size={18} />
                          <span className="name">{recipeAction(t, r)}</span>
                          {skill && <GameIcon src={skill.icon} size={14} />}
                        </div>
                      </td>
                      <td>
                        <LevelTag level={Math.max(1, r.level)} have={r.skill ? (state.profile.levels[r.skill] ?? 1) : 1} />
                      </td>
                      <td className="num">{t('detail.perRunNeeds', { n: fmtNum(need) })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>
        )}

        {(neededBy.length > 0 || toolFor.length > 0) && (
          <Section title={t('detail.requiredFor')}>
            <div className="chips">
              {neededBy.map((p) => (
                <EntityLink key={p.id} type="purchase" id={p.id} icon={p.icon} name={p.name} />
              ))}
              {toolFor.map((r) => (
                <span key={r.id} className="chip">
                  <GameIcon src={r.icon} size={14} /> {recipeAction(t, r)}
                </span>
              ))}
            </div>
          </Section>
        )}

        {item.equipment && (
          <Section title={t('detail.equipment')} hint={item.equipment.type}>
            <Reqs reqs={item.equipment.reqs} />
            {item.equipment.stats.length > 0 && <Stats rows={item.equipment.stats} />}
            {item.equipment.power.length > 0 && <Stats rows={item.equipment.power} />}
            {item.equipment.protection.length > 0 && <Stats rows={item.equipment.protection} />}
            {item.equipment.mods.length > 0 && <Mods mods={item.equipment.mods} />}
          </Section>
        )}
        {item.weapon && (
          <Section title={t('detail.weapon')}>
            <div className="chips">
              <span className="chip">{item.weapon.type}</span>
              <span className="chip">{item.weapon.damage}</span>
              {item.weapon.elements.map((e) => (
                <span key={e} className="chip">
                  {e}
                </span>
              ))}
              {item.weapon.ammo && <span className="chip">{t('detail.ammo', { ammo: item.weapon.ammo })}</span>}
            </div>
          </Section>
        )}
        {item.food && (
          <Section title={t('detail.food')}>
            <p>{t('detail.heals', { n: item.food.healing })}</p>
          </Section>
        )}
        {item.bury && (
          <Section title={t('detail.bury')}>
            <p>
              <GameIcon src={index.currencies.get(item.bury.currency)?.icon} size={14} /> +{fmtInt(item.bury.qty)}{' '}
              {index.currencies.get(item.bury.currency)?.name}
            </p>
          </Section>
        )}
        {item.toolbelt && (
          <Section title={t('detail.tool')} hint={item.toolbelt.slot}>
            <Reqs reqs={item.toolbelt.reqs} />
            {item.toolbelt.mods.length > 0 ? <Mods mods={item.toolbelt.mods} /> : <p className="muted">{t('detail.noBonus')}</p>}
          </Section>
        )}
        {item.bait && item.bait.mods.length > 0 && (
          <Section title={t('detail.bait')}>
            <Mods mods={item.bait.mods} />
          </Section>
        )}
        {item.compost && item.compost.mods.length > 0 && (
          <Section title={t('detail.compost')}>
            <Mods mods={item.compost.mods} />
          </Section>
        )}
        {item.trap && (
          <Section title={t('detail.trap')}>
            <p>{item.trap.type}</p>
          </Section>
        )}
        {item.openable && (
          <Section title={t('detail.contents')}>
            <table className="table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <tbody>
                {item.openable.always.map((d) => (
                  <tr key={`a${d.item}`} data-entity={`item:${d.item}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: d.item } })}>
                    <td>
                      <ItemRef id={d.item} />
                    </td>
                    <td className="num">{fmtInt(d.qty)}×</td>
                    <td className="num">{t('detail.always')}</td>
                  </tr>
                ))}
                {[...item.openable.drops]
                  .sort((a, b) => b.chance - a.chance)
                  .map((d) => (
                    <tr key={d.item} data-entity={`item:${d.item}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: d.item } })}>
                      <td>
                        <ItemRef id={d.item} />
                      </td>
                      <td className="num">{range(d.min, d.max)}×</td>
                      <td className="num">{pct(d.chance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </>
  )
}

function ItemRef({ id }: { id: Id }) {
  const { index } = useGame()
  const item = index.items.get(id)
  return (
    <div className="cell-item">
      <GameIcon src={item?.icon} size={18} />
      <span className="name">{item?.name ?? id}</span>
    </div>
  )
}

function InfoSources({ rows }: { rows: InfoSource[] }) {
  const { index, dispatch } = useGame()
  const { t } = useI18n()
  const open = (s: InfoSource) => {
    if (s.via === 'enemy' && s.from) dispatch({ type: 'view', view: { kind: 'detail', type: 'enemy', id: s.from } })
    else if (s.via === 'chest' && s.chest) dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: s.chest } })
  }
  return (
    <Section title={t('detail.otherSources')} hint={t('detail.otherSourcesHint')}>
      <table className="table">
        <colgroup>
          <col />
          <col style={{ width: 120 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 90 }} />
        </colgroup>
        <tbody>
          {[...rows]
            .sort((a, b) => b.chance - a.chance)
            .map((s, i) => {
              const enemy = s.via === 'enemy' && s.from ? index.data.enemies.find((e) => e.id === s.from) : null
              const entity = enemy ? `enemy:${enemy.id}` : s.chest ? `item:${s.chest}` : undefined
              return (
                <tr key={i} data-entity={entity} onClick={() => open(s)} className={entity ? '' : 'static'}>
                  <td>
                    <div className="cell-item">
                      <GameIcon src={enemy?.icon ?? s.icon} size={18} />
                      <span className="name">{s.name}</span>
                      {s.level ? <span className="lv">Lv {s.level}</span> : null}
                    </div>
                  </td>
                  <td className="muted">
                    {t(`via.${s.via}`)}
                    {s.intervalMs ? ` · ${t('detail.every', { time: fmtDurationShort(s.intervalMs) })}` : ''}
                  </td>
                  <td className="num">{range(s.min, s.max)}×</td>
                  <td className="num">{pct(s.chance)}</td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </Section>
  )
}

// --- Monster

const COMBAT = ['MelvorBase:Hitpoints', 'MelvorBase:Attack', 'MelvorBase:Strength', 'MelvorBase:Defence', 'MelvorBase:Ranged', 'MelvorBase:Magic']

function EnemyDetail({ id }: { id: Id }) {
  const { index } = useGame()
  const { t } = useI18n()
  const e = index.data.enemies?.find((x) => x.id === id)
  if (!e) return <Missing />
  const drops = (index.data.infoSources ?? []).filter((s) => s.via === 'enemy' && s.from === id)
  const areas = (index.data.areas ?? []).filter((a) => a.enemies.includes(id))
  const gp = index.currencies.get(GP)
  return (
    <>
      <DetailToolbar title={e.name} subtitle={t('detail.enemy')} />
      <div className="content narrow-content">
        <Hero
          icon={e.icon}
          title={e.name}
          chips={
            <>
              {e.damageType && <span className="chip">{e.damageType}</span>}
              {e.element && <span className="chip">{e.element}</span>}
              {e.gold && (
                <span className="chip">
                  <GameIcon src={gp?.icon} size={14} /> {range(e.gold.min, e.gold.max)} GP
                </span>
              )}
            </>
          }
        />
        <Section title={t('detail.combatLevels')}>
          <div className="stat-grid">
            {COMBAT.map((s) => (
              <div key={s} className="stat">
                <span>
                  <GameIcon src={index.skills.get(s)?.icon} size={14} /> {index.skills.get(s)?.name ?? s}
                </span>
                <b>{e.levels[s] ?? 1}</b>
              </div>
            ))}
          </div>
        </Section>
        {e.stats.length > 0 && (
          <Section title={t('detail.stats')}>
            <Stats rows={e.stats} />
          </Section>
        )}
        {drops.length > 0 && (
          <Section title={t('detail.drops')}>
            <table className="table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <tbody>
                {[...drops]
                  .sort((a, b) => b.chance - a.chance)
                  .map((d, i) => (
                    <DropRow key={i} item={d.item} amount={range(d.min, d.max)} chance={pct(d.chance)} />
                  ))}
              </tbody>
            </table>
          </Section>
        )}
        {areas.length > 0 && (
          <Section title={t('detail.foundIn')}>
            <div className="chips">
              {areas.map((a) => (
                <EntityLink key={a.id} type="area" id={a.id} icon={a.icon ?? 'game/icons/Icons/Combat.webp'} name={a.name} />
              ))}
            </div>
          </Section>
        )}
        {e.reqs.length > 0 && (
          <Section title={t('detail.requirements')}>
            <Reqs reqs={e.reqs} />
          </Section>
        )}
      </div>
    </>
  )
}

function DropRow({ item, amount, chance }: { item: Id; amount: string; chance: string }) {
  const { dispatch } = useGame()
  return (
    <tr data-entity={`item:${item}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id: item } })}>
      <td>
        <ItemRef id={item} />
      </td>
      <td className="num">{amount}×</td>
      <td className="num">{chance}</td>
    </tr>
  )
}

// --- Gebiet

function AreaDetail({ id }: { id: Id }) {
  const { index, dispatch } = useGame()
  const { t } = useI18n()
  const a = index.data.areas?.find((x) => x.id === id)
  if (!a) return <Missing />
  const enemies = a.enemies.map((e) => index.data.enemies.find((x) => x.id === e)).filter((e) => !!e)
  return (
    <>
      <DetailToolbar title={a.name} subtitle={t(a.kind === 'dungeon' ? 'detail.dungeon' : 'detail.area')} />
      <div className="content narrow-content">
        <Hero
          icon={a.icon ?? 'game/icons/Icons/Combat.webp'}
          title={a.name}
          chips={
            <>
              {a.category && <span className="chip">{a.category}</span>}
              {a.difficulty && <span className="chip">{a.difficulty}</span>}
            </>
          }
        />
        {a.reqs.length > 0 && (
          <Section title={t('detail.requirements')}>
            <Reqs reqs={a.reqs} />
          </Section>
        )}
        <Section title={t('detail.monsters')} hint={String(enemies.length)}>
          <table className="table">
            <colgroup>
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <tbody>
              {enemies.map((e) => (
                <tr key={e.id} data-entity={`enemy:${e.id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'enemy', id: e.id } })}>
                  <td>
                    <div className="cell-item">
                      <GameIcon src={e.icon} size={22} />
                      <span className="name">{e.name}</span>
                    </div>
                  </td>
                  <td className="num">
                    <GameIcon src={index.skills.get('MelvorBase:Hitpoints')?.icon} size={14} /> {e.levels['MelvorBase:Hitpoints'] ?? 1}
                  </td>
                  <td className="num muted">{e.gold ? `${range(e.gold.min, e.gold.max)} GP` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        {a.rewards.length > 0 && (
          <Section title={t('detail.rewards')}>
            <div className="chips">
              {a.rewards.map((r) => (
                <ItemLink key={r.item} id={r.item} qty={`${fmtInt(r.qty)}×`} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  )
}

// --- Shop-Kauf

function PurchaseDetail({ id }: { id: Id }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const p = index.purchases.get(id)
  if (!p) return <Missing />
  const source = (index.data.bonusSources ?? []).find((b) => b.kind === 'purchase' && b.id === id)
  const owned = state.profile.owned[id] > 0
  const gp = index.currencies.get(GP)
  return (
    <>
      <DetailToolbar title={p.name} subtitle={t('detail.purchase')} />
      <div className="content narrow-content">
        <Hero
          icon={p.icon}
          title={p.name}
          text={p.description}
          chips={
            <>
              {p.category && <span className="chip">{p.category}</span>}
              {p.costs.map((c) => (
                <span key={c.currency} className="chip">
                  <GameIcon src={index.currencies.get(c.currency)?.icon ?? gp?.icon} size={14} /> {fmtInt(c.qty)} {index.currencies.get(c.currency)?.short}
                </span>
              ))}
            </>
          }
        >
          {!p.items.length && (
            <button
              className="btn primary"
              onClick={() => dispatch({ type: 'addRoute', route: { id: newId(), kind: 'unlock', purchase: id } })}
            >
              <Sym name="plus" size={13} /> {t('detail.planRoute')}
            </button>
          )}
          <div className="hero-goal">
            <span className="muted">{t('detail.owned')}</span>
            <Switch label={t('detail.owned')} checked={owned} onChange={(v) => dispatch({ type: 'setOwned', purchase: id, owned: v })} />
          </div>
        </Hero>
        {p.reqs.length > 0 && (
          <Section title={t('detail.requirements')}>
            <Reqs reqs={p.reqs} />
          </Section>
        )}
        {p.inputs.length > 0 && (
          <Section title={t('detail.costsItems')}>
            <div className="chips">
              {p.inputs.map((i) => (
                <ItemLink key={i.item} id={i.item} qty={`${fmtInt(i.qty)}×`} />
              ))}
            </div>
          </Section>
        )}
        {p.items.length > 0 && (
          <Section title={t('detail.provides')}>
            <div className="chips">
              {p.items.map((i) => (
                <ItemLink key={i.item} id={i.item} qty={`${fmtInt(i.qty)}×`} />
              ))}
            </div>
          </Section>
        )}
        {source && source.mods.length > 0 && (
          <Section title={t('detail.bonuses')}>
            <Mods mods={source.mods} />
          </Section>
        )}
      </div>
    </>
  )
}

function Missing() {
  const { t } = useI18n()
  return (
    <>
      <DetailToolbar title={t('detail.missing')} />
      <div className="content">
        <p className="muted">{t('detail.missingText')}</p>
      </div>
    </>
  )
}
