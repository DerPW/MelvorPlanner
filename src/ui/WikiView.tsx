// Wiki: alles, was eine Detailseite hat — Items, Monster, Gebiete, Shop,
// Skills. Die Art oben als Schalter, die Kategorien links als gruppierte
// Liste (wie eine macOS-Seitenleiste); ein Klick öffnet die Detailseite.

import { useMemo, useState } from 'react'
import { fmtInt } from '../core/format'
import type { Id } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Segmented, Select, Sym, Toolbar } from './components'
import { useGame, type View } from './state'

type Kind = 'item' | 'enemy' | 'area' | 'purchase' | 'skill'

interface Entry {
  id: Id
  name: string
  icon: string | null
  sub: string
  /** Kategorie (Filter) und ihr Abschnitt in der Liste links */
  group: string
  section: string
  groupIcon?: string | null
  view: View
  entity: string
}

interface Group {
  name: string
  icon: string | null
  count: number
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
          const skill = tag ? index.skills.get(tag) : undefined
          let section: string
          let group: string
          let groupIcon: string | null = null
          if (i.equipment) {
            section = t('wiki.secGear')
            group = t(`slot.${i.equipment.type === 'Ring' ? 'RingSlot1' : i.equipment.type}`)
          } else if (i.food) {
            section = t('wiki.secMore')
            group = t('wiki.food')
          } else if (skill) {
            section = t('wiki.secSkills')
            group = skill.name
            groupIcon = skill.icon
          } else {
            section = t('wiki.secMore')
            group = tag ? tag.replace(/^MelvorBase:/, '') : t('wiki.other')
          }
          return {
            id: i.id,
            name: i.name,
            icon: i.icon,
            sub: i.sells ? `${fmtInt(i.sells.qty)} GP` : '',
            group,
            section,
            groupIcon,
            view: { kind: 'detail', type: 'item', id: i.id },
            entity: `item:${i.id}`,
          }
        })
    if (kind === 'enemy') {
      // Gebiet des Monsters (normale Gebiete vor Dungeons), Abschnitt = Gebietskategorie
      const where = new Map<Id, { name: string; icon: string | null; section: string }>()
      for (const a of d.areas ?? [])
        for (const e of a.enemies)
          if (!where.has(e) || a.kind === 'area')
            where.set(e, { name: a.name, icon: a.icon, section: a.kind === 'dungeon' ? t('detail.dungeon') : (a.category ?? t('detail.area')) })
      return (d.enemies ?? []).map((e) => {
        const w = where.get(e.id)
        return {
          id: e.id,
          name: e.name,
          icon: e.icon,
          sub: `HP ${fmtInt((e.levels['MelvorBase:Hitpoints'] ?? 1) * 10)}`,
          group: w?.name ?? t('wiki.other'),
          section: w?.section ?? t('wiki.secMore'),
          groupIcon: w?.icon,
          view: { kind: 'detail', type: 'enemy', id: e.id },
          entity: `enemy:${e.id}`,
        }
      })
    }
    if (kind === 'area')
      return (d.areas ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon ?? 'game/icons/Icons/Combat.webp',
        sub: t('wiki.monsters', { n: a.enemies.length }),
        group: a.kind === 'dungeon' ? t('detail.dungeon') : (a.category ?? t('detail.area')),
        section: '',
        view: { kind: 'detail', type: 'area', id: a.id },
        entity: `area:${a.id}`,
      }))
    if (kind === 'purchase') {
      const cat = new Map<Id, { name: string; icon: string | null }>()
      for (const c of d.shop ?? []) for (const s of c.subcategories) for (const p of s.purchases) cat.set(p, { name: c.name, icon: c.icon })
      return d.purchases
        .filter((p) => !p.demoLocked)
        .map((p) => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
          sub: p.category ?? '',
          group: cat.get(p.id)?.name ?? t('wiki.other'),
          section: '',
          groupIcon: cat.get(p.id)?.icon,
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
      section: '',
      view: { kind: 'skill', skill: s.id },
      entity: `skill:${s.id}`,
    }))
  }, [index, kind, t])

  // Kategorien je Abschnitt, alphabetisch
  const sections = useMemo(() => {
    const out = new Map<string, Map<string, Group>>()
    for (const e of entries) {
      if (!e.group) continue
      const sec = out.get(e.section) ?? new Map<string, Group>()
      out.set(e.section, sec)
      const g = sec.get(e.group) ?? { name: e.group, icon: e.groupIcon ?? null, count: 0 }
      // Ohne eigenes Symbol (Ausrüstungsplätze, Essen …) steht das des ersten Eintrags da
      g.icon ??= e.icon
      g.count++
      sec.set(e.group, g)
    }
    return [...out].map(([name, groups]) => ({ name, groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
  }, [entries])
  const hasGroups = sections.some((s) => s.groups.length > 1)

  const term = q.trim().toLowerCase()
  const shown = entries
    .filter((e) => !group || e.group === group)
    .filter((e) => !term || e.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name))

  const kinds: { value: Kind; label: string }[] = [
    { value: 'item', label: t('search.group.items') },
    { value: 'enemy', label: t('search.group.enemies') },
    { value: 'area', label: t('wiki.areas') },
    { value: 'purchase', label: t('shop.title') },
    { value: 'skill', label: t('search.group.skills') },
  ]
  const pick = (k: Kind) => {
    setKind(k)
    setGroup('')
  }

  return (
    <>
      <Toolbar title={t('wiki.title')} subtitle={t('wiki.subtitle', { n: shown.length })}>
        <Segmented<Kind> value={kind} onChange={pick} options={kinds} />
        <div className="search" style={{ width: 200 }}>
          <Sym name="search" size={15} className="sym-lead" />
          <input value={q} placeholder={t('wiki.filter')} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Toolbar>
      <div className="content">
        <div className={`wiki-layout ${hasGroups ? '' : 'single'}`}>
          {hasGroups && (
            <>
              <nav className="wiki-filter" aria-label={t('wiki.categories')}>
                <button className={`wf-row ${group === '' ? 'active' : ''}`} onClick={() => setGroup('')}>
                  <span className="grow">{t('bank.all')}</span>
                  <span className="wf-count">{entries.length}</span>
                </button>
                {sections.map((s) => (
                  <div key={s.name} className="wf-section">
                    {s.name && <div className="wf-label">{s.name}</div>}
                    {s.groups.map((g) => (
                      <button key={g.name} className={`wf-row ${group === g.name ? 'active' : ''}`} onClick={() => setGroup(group === g.name ? '' : g.name)}>
                        {g.icon ? <img src={g.icon} alt="" /> : <span className="wf-dot" />}
                        <span className="grow">{g.name}</span>
                        <span className="wf-count">{g.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
              {/* Schmal: dieselbe Auswahl als Menü */}
              <div className="wiki-filter-select">
                <Select label={t('wiki.categories')} value={group} onChange={setGroup}>
                  <option value="">
                    {t('bank.all')} ({entries.length})
                  </option>
                  {sections.map((s) => (
                    <optgroup key={s.name} label={s.name || t('wiki.categories')}>
                      {s.groups.map((g) => (
                        <option key={g.name} value={g.name}>
                          {g.name} ({g.count})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            </>
          )}
          <div className="wiki-results">
            {group && (
              <div className="group-title">
                {group} <span className="muted">{shown.length}</span>
              </div>
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
            {shown.length === 0 && <p className="muted">{t('bank.none')}</p>}
          </div>
        </div>
      </div>
    </>
  )
}
