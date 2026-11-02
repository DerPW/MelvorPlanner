// Wiki: alles, was eine Detailseite hat — Items, Monster, Gebiete, Shop,
// Skills. Suche, Filter nach Art und Kategorie; ein Klick öffnet die Seite.

import { useMemo, useState } from 'react'
import { fmtInt } from '../core/format'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Sym, TabPills, Toolbar } from './components'
import { useGame, type View } from './state'

type Kind = 'item' | 'enemy' | 'area' | 'purchase' | 'skill'

interface Entry {
  id: Id
  name: string
  icon: string | null
  sub: string
  group: string
  view: View
  entity: string
}

export function WikiView() {
  const { index, dispatch } = useGame()
  const { t } = useI18n()
  const [kind, setKind] = useState<Kind>('item')
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')

  const entries = useMemo<Entry[]>(() => {
    const d = index.data
    if (kind === 'item')
      return d.items
        .filter((i) => !i.id.endsWith(':DemoPlaceholderItem'))
        .map((i) => {
          const tag = i.bankTags?.find((b) => b.product)?.tag ?? i.bankTags?.[0]?.tag
          const group = i.equipment ? t(`slot.${i.equipment.type === 'Ring' ? 'RingSlot1' : i.equipment.type}`) : i.food ? t('wiki.food') : tag ? (index.skills.get(tag)?.name ?? tag.replace(/^MelvorBase:/, '')) : t('wiki.other')
          return {
            id: i.id,
            name: i.name,
            icon: i.icon,
            sub: i.sells ? `${fmtInt(i.sells.qty)} GP` : '',
            group,
            view: { kind: 'detail', type: 'item', id: i.id },
            entity: `item:${i.id}`,
          }
        })
    if (kind === 'enemy') {
      const area = new Map<Id, string>()
      for (const a of d.areas ?? []) for (const e of a.enemies) if (!area.has(e) || a.kind === 'area') area.set(e, a.name)
      return (d.enemies ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        sub: `HP ${fmtInt((e.levels['MelvorBase:Hitpoints'] ?? 1) * 10)}`,
        group: area.get(e.id) ?? t('wiki.other'),
        view: { kind: 'detail', type: 'enemy', id: e.id },
        entity: `enemy:${e.id}`,
      }))
    }
    if (kind === 'area')
      return (d.areas ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon ?? 'game/icons/Icons/Combat.webp',
        sub: t('wiki.monsters', { n: a.enemies.length }),
        group: a.kind === 'dungeon' ? t('detail.dungeon') : (a.category ?? t('detail.area')),
        view: { kind: 'detail', type: 'area', id: a.id },
        entity: `area:${a.id}`,
      }))
    if (kind === 'purchase') {
      const cat = new Map<Id, string>()
      for (const c of d.shop ?? []) for (const s of c.subcategories) for (const p of s.purchases) cat.set(p, c.name)
      return d.purchases
        .filter((p) => !p.demoLocked)
        .map((p) => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
          sub: p.category ?? '',
          group: cat.get(p.id) ?? t('wiki.other'),
          view: { kind: 'detail', type: 'purchase', id: p.id },
          entity: `purchase:${p.id}`,
        }))
    }
    return d.skills.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      sub: t('wiki.recipes', { n: d.recipes.filter((r) => r.skill === s.id && r.xp > 0 && !r.demoLocked).length }),
      group: '',
      view: { kind: 'skill', skill: s.id },
      entity: `skill:${s.id}`,
    }))
  }, [index, kind, t])

  const groups = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of entries) if (e.group) count.set(e.group, (count.get(e.group) ?? 0) + 1)
    return [...count].sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries])

  const term = q.trim().toLowerCase()
  const shown = entries
    .filter((e) => !group || e.group === group)
    .filter((e) => !term || e.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name))

  const kinds: { value: Kind; label: string }[] = [
    { value: 'item', label: t('search.group.items') },
    { value: 'enemy', label: t('search.group.enemies') },
    { value: 'area', label: t('search.group.areas') },
    { value: 'purchase', label: t('search.group.shop') },
    { value: 'skill', label: t('search.group.skills') },
  ]

  return (
    <>
      <Toolbar title={t('wiki.title')} subtitle={t('wiki.subtitle', { n: shown.length })}>
        <div className="search" style={{ width: 220 }}>
          <Sym name="search" size={15} className="sym-lead" />
          <input value={q} placeholder={t('wiki.filter')} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Toolbar>
      <div className="content">
        <TabPills<Kind>
          value={kind}
          onChange={(k) => {
            setKind(k)
            setGroup('')
          }}
          options={kinds}
        />
        {groups.length > 1 && (
          <TabPills<string>
            value={group}
            onChange={setGroup}
            options={[{ value: '', label: t('bank.all'), count: entries.length }, ...groups.map(([g, n]) => ({ value: g, label: g, count: n }))]}
          />
        )}
        <div className="wiki-grid">
          {shown.map((e) => (
            <button key={e.id} className="wiki-row" data-entity={e.entity} onClick={() => dispatch({ type: 'view', view: e.view })}>
              <GameIcon src={e.icon} size={28} />
              <span className="wiki-text">
                <b>{e.name}</b>
                <span className="muted">{[e.sub, group ? '' : e.group].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
