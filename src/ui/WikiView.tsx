// Wiki: alles, was eine Detailseite hat — Items, Monster, Gebiete, Shop,
// Skills. Die Startseite zeigt je Art die Kategorien als Kacheln; ein Klick
// führt hinein, die Brotkrumen zeigen den Weg zurück (Wiki › Items › Waffe).
// Die Suche geht auf der Startseite über alles, sonst über die Unterseite.

import { useMemo, useState } from 'react'
import { fmtInt } from '../core/format'
import type { GameIndex } from '../core/planner'
import type { Id } from '../core/types'
import { useI18n, type T } from '../i18n'
import { GameIcon, Sym, Toolbar } from './components'
import { useGame, type View, type WikiKind } from './state'

const ui = (name: string) => `game/icons/Icons/${name}.webp`
/** Das Fragezeichen des Spiels zählt nicht als Symbol (gesperrte Monster, Gebiete ohne Bild) */
const real = (icon: string | null | undefined) => (icon && !icon.endsWith('/question.webp') ? icon : null)

export const WIKI_KINDS: WikiKind[] = ['item', 'enemy', 'area', 'purchase', 'skill']
const KIND_ICON: Record<WikiKind, string> = { item: ui('Bank'), enemy: ui('Combat'), area: ui('CheckeredFlag'), purchase: ui('Shop'), skill: ui('Milestones') }

export function wikiKindLabel(t: T, k: WikiKind) {
  return k === 'item' ? t('search.group.items') : k === 'enemy' ? t('search.group.enemies') : k === 'area' ? t('wiki.areas') : k === 'purchase' ? t('shop.title') : t('search.group.skills')
}

interface Entry {
  id: Id
  name: string
  icon: string | null
  sub: string
  kind: WikiKind
  /** Kategorie: fester Schlüssel (steht in der Ansicht), Name, Symbol, Reihenfolge */
  group: string
  groupName: string
  groupIcon: string | null
  groupOrder?: number
  /** Abschnitt auf der Startseite und seine Reihenfolge */
  section: string
  rank: number
  view: View
  entity: string
}

function build(index: GameIndex, kind: WikiKind, t: T): Entry[] {
  const d = index.data
  if (kind === 'item')
    return d.items
      // Platzhalter (Demo, „Fäuste“) sind keine echten Items
      .filter((i) => !i.id.endsWith(':DemoPlaceholderItem') && !i.id.endsWith(':DefaultWeapon'))
      .map((i) => {
        const tag = i.bankTags?.find((b) => b.product)?.tag ?? i.bankTags?.[0]?.tag
        const skill = tag ? index.skills.get(tag) : undefined
        const g = i.equipment
          ? { group: `slot:${i.equipment.type}`, groupName: t(`slot.${i.equipment.type === 'Ring' ? 'RingSlot1' : i.equipment.type}`), groupIcon: null, section: t('wiki.secGear'), rank: 0 }
          : i.food
            ? { group: 'food', groupName: t('wiki.food'), groupIcon: null, section: t('wiki.secMore'), rank: 2 }
            : skill
              ? { group: `skill:${skill.id}`, groupName: skill.name, groupIcon: skill.icon, section: t('wiki.secSkills'), rank: 1 }
              : { group: `tag:${tag ?? ''}`, groupName: tag ? tag.replace(/^MelvorBase:/, '') : t('wiki.other'), groupIcon: null, section: t('wiki.secMore'), rank: 2 }
        return { id: i.id, name: i.name, icon: i.icon, sub: i.sells ? `${fmtInt(i.sells.qty)} GP` : '', kind, ...g, view: { kind: 'detail', type: 'item', id: i.id }, entity: `item:${i.id}` }
      })
  if (kind === 'enemy') {
    // Gebiet des Monsters (normale Gebiete vor Dungeons) in Spielreihenfolge,
    // Abschnitt = Gebietskategorie
    const areas = d.areas ?? []
    const cats = [...new Set(areas.filter((a) => a.kind !== 'dungeon').map((a) => a.category ?? ''))]
    const where = new Map<Id, (typeof areas)[number]>()
    for (const a of areas) for (const e of a.enemies) if (!where.has(e) || a.kind === 'area') where.set(e, a)
    return (d.enemies ?? []).map((e) => {
      const a = where.get(e.id)
      const dungeon = a?.kind === 'dungeon'
      return {
        id: e.id,
        name: e.name,
        icon: e.icon,
        sub: `HP ${fmtInt((e.levels['MelvorBase:Hitpoints'] ?? 1) * 10)}`,
        kind,
        group: a ? `area:${a.id}` : 'other',
        groupName: a?.name ?? t('wiki.other'),
        groupIcon: a?.icon ?? null,
        groupOrder: a ? areas.indexOf(a) : undefined,
        section: !a ? t('wiki.secMore') : dungeon ? t('detail.dungeon') : (a.category ?? t('detail.area')),
        rank: !a ? 999 : dungeon ? 500 : cats.indexOf(a.category ?? ''),
        view: { kind: 'detail', type: 'enemy', id: e.id },
        entity: `enemy:${e.id}`,
      }
    })
  }
  if (kind === 'area')
    return (d.areas ?? []).map((a) => {
      const dungeon = a.kind === 'dungeon'
      return {
        id: a.id,
        name: a.name,
        icon: a.icon ?? ui('Combat'),
        sub: t('wiki.monsters', { n: a.enemies.length }),
        kind,
        group: dungeon ? 'dungeon' : `cat:${a.category ?? ''}`,
        groupName: dungeon ? t('detail.dungeon') : (a.category ?? t('detail.area')),
        groupIcon: null,
        groupOrder: dungeon ? 999 : undefined,
        section: '',
        rank: 0,
        view: { kind: 'detail', type: 'area', id: a.id },
        entity: `area:${a.id}`,
      }
    })
  if (kind === 'purchase') {
    const shop = d.shop ?? []
    const cat = new Map<Id, (typeof shop)[number]>()
    for (const c of shop) for (const s of c.subcategories) for (const p of s.purchases) cat.set(p, c)
    return d.purchases
      .filter((p) => !p.demoLocked)
      .map((p) => {
        const c = cat.get(p.id)
        return {
          id: p.id,
          name: p.name,
          icon: p.icon,
          sub: p.category ?? '',
          kind,
          group: c ? `shop:${c.id}` : 'other',
          groupName: c?.name ?? t('wiki.other'),
          groupIcon: c?.icon ?? null,
          groupOrder: c ? shop.indexOf(c) : undefined,
          section: '',
          rank: 0,
          view: { kind: 'detail', type: 'purchase', id: p.id },
          entity: `purchase:${p.id}`,
        }
      })
  }
  // Skills haben keine Kategorien — auf der Startseite sind sie selbst die Kacheln
  return d.skills.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    sub: t('wiki.recipes', { n: d.recipes.filter((r) => r.skill === s.id && r.xp > 0 && !r.demoLocked).length }),
    kind,
    group: '',
    groupName: '',
    groupIcon: null,
    section: '',
    rank: 0,
    view: { kind: 'skill', skill: s.id },
    entity: `skill:${s.id}`,
  }))
}

// Der Index wechselt mit jedem Live-Abgleich; je Index und Sprache einmal bauen
const cache = new WeakMap<GameIndex, Map<WikiKind, { t: T; list: Entry[] }>>()
function wikiEntries(index: GameIndex, kind: WikiKind, t: T): Entry[] {
  const m = cache.get(index) ?? new Map<WikiKind, { t: T; list: Entry[] }>()
  cache.set(index, m)
  const hit = m.get(kind)
  if (hit && hit.t === t) return hit.list
  const list = build(index, kind, t)
  m.set(kind, { t, list })
  return list
}

interface Group {
  key: string
  name: string
  icon: string | null
  /** falls kein Eintrag ein echtes Symbol hat */
  fallback: string | null
  count: number
  order: number
}

/** Kategorien je Abschnitt: Abschnitte nach Rang, Kategorien in Spielreihenfolge, sonst alphabetisch */
function sectionsOf(entries: Entry[]) {
  const out = new Map<string, { name: string; rank: number; groups: Group[] }>()
  const groups = new Map<string, Group>()
  for (const e of entries) {
    if (!e.group) continue
    let g = groups.get(e.group)
    if (!g) {
      // Ohne eigenes Symbol (Ausrüstungsplätze, Essen …) steht das des ersten Eintrags da, der eins hat
      g = { key: e.group, name: e.groupName, icon: real(e.groupIcon) ?? real(e.icon), fallback: e.groupIcon ?? e.icon, count: 0, order: e.groupOrder ?? Infinity }
      groups.set(e.group, g)
      const s = out.get(e.section) ?? { name: e.section, rank: e.rank, groups: [] }
      out.set(e.section, s)
      s.groups.push(g)
    }
    g.icon ??= real(e.icon)
    g.count++
  }
  const byOrder = (a: Group, b: Group) => a.order - b.order || a.name.localeCompare(b.name)
  return [...out.values()].sort((a, b) => a.rank - b.rank).map((s) => ({ ...s, groups: s.groups.sort(byOrder).map((g) => ({ ...g, icon: g.icon ?? g.fallback })) }))
}

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name)

/** Name und Symbol einer Wiki-Seite — für Titel und Brotkrumen */
export function wikiStation(index: GameIndex, t: T, v: { section?: WikiKind; group?: string }): { label: string; icon: string | null } {
  if (!v.section) return { label: t('wiki.title'), icon: ui('codex') }
  if (!v.group) return { label: wikiKindLabel(t, v.section), icon: KIND_ICON[v.section] }
  const list = wikiEntries(index, v.section, t).filter((x) => x.group === v.group)
  const icon = real(list[0]?.groupIcon) ?? list.map((x) => real(x.icon)).find(Boolean)
  return { label: list[0]?.groupName ?? v.group, icon: icon ?? KIND_ICON[v.section] }
}

export function WikiView({ section, group }: { section?: WikiKind; group?: string }) {
  const { index } = useGame()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const all = useMemo(() => (section ? [section] : WIKI_KINDS).flatMap((k) => wikiEntries(index, k, t)), [index, section, t])
  const scope = group ? all.filter((e) => e.group === group) : all
  const term = q.trim().toLowerCase()
  const hits = term ? scope.filter((e) => e.name.toLowerCase().includes(term)).sort(byName) : null
  const title = section ? wikiStation(index, t, { section, group }).label : t('wiki.title')
  const count = t('wiki.subtitle', { n: fmtInt((hits ?? scope).length) })

  let body
  if (hits) body = hits.length ? <EntryGrid entries={hits} context={!group} /> : <p className="muted">{t('bank.none')}</p>
  else if (group) body = <EntryGrid entries={[...scope].sort(byName)} />
  else if (section) body = <KindPage kind={section} entries={all} />
  else body = WIKI_KINDS.map((k) => <KindTiles key={k} kind={k} entries={wikiEntries(index, k, t)} />)

  return (
    <>
      <Toolbar title={title} subtitle={group && section ? `${wikiKindLabel(t, section)} · ${count}` : count}>
        <div className="search" style={{ width: 220 }}>
          <Sym name="search" size={15} className="sym-lead" />
          <input value={q} placeholder={section ? t('wiki.searchIn', { name: title }) : t('wiki.filter')} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Toolbar>
      <div className="content">{body}</div>
    </>
  )
}

/** Startseite: je Art ihre Kategorien als Kacheln */
function KindTiles({ kind, entries }: { kind: WikiKind; entries: Entry[] }) {
  const { dispatch } = useGame()
  const { t } = useI18n()
  const open = (view: View) => dispatch({ type: 'view', view })
  const sections = sectionsOf(entries)
  return (
    <section className="wiki-kind">
      <div className="wiki-kind-head">
        <img src={KIND_ICON[kind]} alt="" />
        <h2>{wikiKindLabel(t, kind)}</h2>
        <span className="muted">{fmtInt(entries.length)}</span>
        <span className="spacer" />
        <button className="link" onClick={() => open({ kind: 'wiki', section: kind })}>
          {t('wiki.showAll')}
        </button>
      </div>
      {sections.length > 0 ? (
        sections.map((s) => (
          <div key={s.name}>
            {s.name && sections.length > 1 && <div className="wiki-sec-label">{s.name}</div>}
            <div className="wiki-tiles">
              {s.groups.map((g) => (
                <button key={g.key} className="wiki-tile" onClick={() => open({ kind: 'wiki', section: kind, group: g.key })}>
                  <GameIcon src={g.icon} size={32} />
                  <span className="wt-name">{g.name}</span>
                  <span className="wt-count">{fmtInt(g.count)}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="wiki-tiles">
          {entries.map((e) => (
            <button key={e.id} className="wiki-tile" data-entity={e.entity} onClick={() => open(e.view)}>
              <GameIcon src={e.icon} size={32} />
              <span className="wt-name">{e.name}</span>
              <span className="wt-count">{e.sub}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** Alle Einträge einer Art, nach Kategorie gruppiert; die Überschrift führt in die Kategorie */
function KindPage({ kind, entries }: { kind: WikiKind; entries: Entry[] }) {
  const { dispatch } = useGame()
  const sections = sectionsOf(entries)
  if (!sections.length) return <EntryGrid entries={[...entries].sort(byName)} />
  return sections.map((s) => (
    <div key={s.name}>
      {s.name && sections.length > 1 && <div className="wiki-sec-label">{s.name}</div>}
      {s.groups.map((g) => (
        <section key={g.key} className="wiki-group">
          <button className="group-title wiki-group-title" onClick={() => dispatch({ type: 'view', view: { kind: 'wiki', section: kind, group: g.key } })}>
            <GameIcon src={g.icon} size={18} />
            {g.name} <span className="muted">{fmtInt(g.count)}</span>
            <Sym name="chevron" size={10} className="wg-chevron" />
          </button>
          <EntryGrid entries={entries.filter((e) => e.group === g.key).sort(byName)} />
        </section>
      ))}
    </div>
  ))
}

/** Einträge als Zeilen; in Suchtreffern über alles mit Art und Kategorie */
function EntryGrid({ entries, context }: { entries: Entry[]; context?: boolean }) {
  const { dispatch } = useGame()
  const { t } = useI18n()
  return (
    <div className="wiki-grid">
      {entries.map((e) => (
        <button key={`${e.kind}:${e.id}`} className="wiki-row" data-entity={e.entity} onClick={() => dispatch({ type: 'view', view: e.view })}>
          <GameIcon src={e.icon} size={28} />
          <span className="wiki-text">
            <b>{e.name}</b>
            <span className="muted">{(context ? [wikiKindLabel(t, e.kind), e.groupName, e.sub] : [e.sub]).filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
