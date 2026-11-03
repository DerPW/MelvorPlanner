// Bank: das Lager wie im Spiel — Reiter aus dem Spielstand, Kacheln mit
// Menge, Suche, Gesamtwert. Ohne Spielstand (oder zum Ausprobieren) lassen
// sich Mengen von Hand ändern.

import { useMemo, useState } from 'react'
import { fmtCompact, fmtInt } from '../core/format'
import { GP } from '../core/route'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Stepper, Sym, TabPills, Toolbar } from './components'
import { ItemSearch } from './ItemSearch'
import { useGame } from './state'

const ALL = '__all'

export function BankView() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const p = state.profile
  const [tab, setTab] = useState(ALL)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(false)

  // Reiter aus dem Spielstand; was (noch) in keinem steht, kommt unter „Weitere"
  const tabs = useMemo(() => {
    const list = (p.bankTabs ?? []).filter((x) => x.items.some((i) => (p.inventory[i.item] ?? 0) > 0)).map((x, i) => ({ id: `t${i}`, name: x.name || t('bank.tab', { n: i + 1 }), items: x.items.map((i) => i.item) }))
    const placed = new Set(list.flatMap((x) => x.items))
    const rest = Object.keys(p.inventory).filter((id) => !placed.has(id))
    if (list.length && rest.length) list.push({ id: 'rest', name: t('bank.rest'), items: rest })
    return list
  }, [p.bankTabs, p.inventory, t])

  const shown = useMemo(() => {
    const ids = tab === ALL ? Object.keys(p.inventory) : (tabs.find((x) => x.id === tab)?.items ?? [])
    const term = q.trim().toLowerCase()
    return ids
      .filter((id) => (p.inventory[id] ?? 0) > 0)
      .filter((id) => !term || (index.items.get(id)?.name ?? id).toLowerCase().includes(term))
  }, [tab, tabs, p.inventory, q, index])

  const value = (ids: Id[]) => ids.reduce((s, id) => s + (p.inventory[id] ?? 0) * (index.items.get(id)?.sells?.currency === GP ? (index.items.get(id)?.sells?.qty ?? 0) : 0), 0)
  const total = Object.keys(p.inventory).length

  return (
    <>
      <Toolbar title={t('bank.title')} subtitle={t('bank.subtitle', { n: total, gp: fmtInt(value(Object.keys(p.inventory))) })}>
        <div className="search" style={{ width: 200 }}>
          <Sym name="search" size={15} className="sym-lead" />
          <input value={q} placeholder={t('bank.filter')} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className={`btn small ${edit ? '' : 'plain'}`} onClick={() => setEdit(!edit)}>
          {t(edit ? 'bank.done' : 'bank.edit')}
        </button>
      </Toolbar>
      <div className="content">
        {tabs.length > 0 && (
          <TabPills<string>
            value={tab}
            onChange={setTab}
            options={[
              { value: ALL, label: t('bank.all'), count: total },
              ...tabs.map((x) => ({ value: x.id, label: x.name, count: x.items.filter((i) => (p.inventory[i] ?? 0) > 0).length })),
            ]}
          />
        )}
        {edit && (
          <div className="bank-add">
            <ItemSearch placeholder={t('stock.add')} width={260} onPick={(item) => dispatch({ type: 'setStock', item, qty: (p.inventory[item] ?? 0) + 1 })} />
            <span className="muted">{t('bank.editHint')}</span>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="muted" style={{ margin: '24px 4px' }}>
            {total ? t('bank.none') : t('stock.empty')}
          </p>
        ) : edit ? (
          <div className="form-group">
            {shown.map((id) => (
              <div className="form-row" key={id}>
                <GameIcon src={index.items.get(id)?.icon} size={22} entity={`item:${id}`} />
                <span className="grow" data-entity={`item:${id}`}>
                  {index.items.get(id)?.name ?? id}
                </span>
                <Stepper label={t('stock.qty')} value={p.inventory[id] ?? 0} onChange={(qty) => dispatch({ type: 'setStock', item: id, qty })} />
                <button className="icon-btn" aria-label={t('common.remove')} onClick={() => dispatch({ type: 'setStock', item: id, qty: 0 })}>
                  <Sym name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bank-grid">
            {shown.map((id) => (
              <button key={id} className="bank-tile" data-entity={`item:${id}`} onClick={() => dispatch({ type: 'view', view: { kind: 'detail', type: 'item', id } })}>
                <GameIcon src={index.items.get(id)?.icon} size={40} />
                <span className="bank-qty">{fmtCompact(p.inventory[id] ?? 0)}</span>
              </button>
            ))}
          </div>
        )}
        {tab !== ALL && shown.length > 0 && <p className="muted small-note">{t('bank.tabValue', { gp: fmtInt(value(shown)) })}</p>}
      </div>
    </>
  )
}
