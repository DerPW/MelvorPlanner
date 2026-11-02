// Shop wie im Spiel: Kategorien → Unterkategorien → Käufe. Je Kauf, was er
// kostet, bringt und verlangt — und ob er schon gekauft ist.

import { useMemo, useState } from 'react'
import { unmetReqs } from '../core/planner'
import { GP } from '../core/route'
import { fmtInt } from '../core/format'
import type { Purchase } from '../core/types'
import { useI18n } from '../i18n'
import { modLabel, modValue } from './bonusText'
import { GameIcon, Ref, Sym, TabPills, Toolbar } from './components'
import { Needs } from './SolutionView'
import { newId, planItem, useGame } from './state'

const ALL = '__all'
type Show = 'all' | 'open' | 'owned'

export function ShopView() {
  const { index, state } = useGame()
  const { t } = useI18n()
  const [cat, setCat] = useState(ALL)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')
  const shop = index.data.shop ?? []
  const owned = Object.keys(state.profile.owned).length

  const sections = useMemo(() => {
    const term = q.trim().toLowerCase()
    return shop
      .filter((c) => cat === ALL || c.id === cat)
      .flatMap((c) =>
        c.subcategories.map((s) => ({
          key: `${c.id}/${s.id}`,
          title: cat === ALL ? `${c.name} › ${s.name}` : s.name,
          icon: s.icon,
          purchases: s.purchases
            .map((id) => index.purchases.get(id))
            .filter((p): p is Purchase => !!p && !p.demoLocked)
            .filter((p) => !term || p.name.toLowerCase().includes(term) || p.items.some((i) => index.items.get(i.item)?.name.toLowerCase().includes(term)))
            .filter((p) => (show === 'all' ? true : show === 'owned' ? state.profile.owned[p.id] > 0 : !(state.profile.owned[p.id] > 0) || !p.buyLimit)),
        })),
      )
      .filter((s) => s.purchases.length)
  }, [shop, cat, q, show, index, state.profile.owned])

  return (
    <>
      <Toolbar title={t('shop.title')} subtitle={t('shop.subtitle', { gp: fmtInt(state.profile.currencies[GP] ?? 0), n: owned })}>
        <TabPills<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: t('shop.showAll') },
            { value: 'open', label: t('shop.showOpen') },
            { value: 'owned', label: t('shop.showOwned') },
          ]}
        />
        <div className="search" style={{ width: 200 }}>
          <Sym name="search" size={15} className="sym-lead" />
          <input value={q} placeholder={t('shop.filter')} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Toolbar>
      <div className="content">
        <TabPills<string>
          value={cat}
          onChange={setCat}
          options={[{ value: ALL, label: t('bank.all') }, ...shop.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))]}
        />
        {sections.length === 0 && <p className="muted">{t('bank.none')}</p>}
        {sections.map((s) => (
          <section key={s.key} className="shop-section">
            <div className="group-title">
              {s.icon && <img src={s.icon} alt="" width={18} height={18} />}
              {s.title} <span className="muted">{s.purchases.length}</span>
            </div>
            <div className="shop-grid">
              {s.purchases.map((p) => (
                <ShopCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function ShopCard({ p }: { p: Purchase }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const count = state.profile.owned[p.id] ?? 0
  const done = !!p.buyLimit && count >= p.buyLimit
  const unmet = unmetReqs(p.reqs, state.profile)
  const mods = index.data.bonusSources.find((b) => b.kind === 'purchase' && b.id === p.id)?.mods ?? []
  const gold = p.costs.find((c) => c.currency === GP)?.qty ?? 0
  const affordable = (state.profile.currencies[GP] ?? 0) >= gold
  const plan = () => {
    if (p.items.length) dispatch(planItem(p.items[0].item, p.items[0].qty))
    else dispatch({ type: 'addRoute', route: { id: newId(), kind: 'unlock', purchase: p.id } })
  }
  return (
    <div className={`shop-card ${done ? 'owned' : ''} ${unmet.length ? 'locked' : ''}`} data-entity={`purchase:${p.id}`}>
      <div className="sc-head">
        <GameIcon src={p.icon} size={36} />
        <div className="sc-title">
          <Ref entity={`purchase:${p.id}`}>{p.name}</Ref>
          {p.description && <p>{p.description}</p>}
        </div>
      </div>
      {(p.items.length > 0 || mods.length > 0) && (
        <div className="sc-provides">
          {p.items.map((i) => (
            <span key={i.item} className="chip" data-entity={`item:${i.item}`}>
              <GameIcon src={index.items.get(i.item)?.icon} size={14} /> +{fmtInt(i.qty)} {index.items.get(i.item)?.name}
            </span>
          ))}
          {mods.slice(0, 3).map((m, i) => (
            <span key={i} className="chip bonus">
              {modValue(m, m.value)} {modLabel(m, t)}
            </span>
          ))}
        </div>
      )}
      <div className="sc-costs">
        {gold > 0 && (
          <span className={affordable ? 'gold' : 'bad'}>
            <GameIcon src={index.currencies.get(GP)?.icon} size={14} /> {fmtInt(gold)}
          </span>
        )}
        {p.costs
          .filter((c) => c.currency !== GP)
          .map((c) => (
            <span key={c.currency}>
              <GameIcon src={index.currencies.get(c.currency)?.icon} size={14} /> {fmtInt(c.qty)}
            </span>
          ))}
        {p.inputs.map((i) => (
          <span key={i.item} data-entity={`item:${i.item}`} className={(state.profile.inventory[i.item] ?? 0) >= i.qty ? '' : 'bad'}>
            <GameIcon src={index.items.get(i.item)?.icon} size={14} /> {fmtInt(i.qty)}
          </span>
        ))}
        {p.buyLimit ? <span className="muted">{t('shop.limit', { n: count, max: p.buyLimit })}</span> : null}
      </div>
      {unmet.length > 0 && <Needs reqs={unmet} className="tag warn sc-needs" />}
      <div className="sc-actions">
        {done ? (
          <span className="ok">
            <Sym name="check" size={12} /> {t('shop.owned')}
          </span>
        ) : (
          <button className="btn small" onClick={plan}>
            {t('shop.plan')}
          </button>
        )}
        {(p.buyLimit ?? 0) > 0 && (
          <button className="link" onClick={() => dispatch({ type: 'setOwned', purchase: p.id, owned: !done })}>
            {t(done ? 'menu.markNotOwned' : 'menu.markOwned')}
          </button>
        )}
      </div>
    </div>
  )
}
