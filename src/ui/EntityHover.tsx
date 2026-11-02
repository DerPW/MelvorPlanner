// Tooltip und Kontextmenü für alles mit eigener Seite. Jedes Element mit
// data-entity="<typ>:<id>" bekommt beides — neue Ansichten müssen nur das
// Attribut setzen.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmtDurationShort, fmtInt } from '../core/format'
import { actionTime, rankSources, yieldOf } from '../core/planner'
import { GP } from '../core/route'
import { useI18n } from '../i18n'
import { GameIcon, LevelTag } from './components'
import { recipeAction } from './SolutionView'
import { newId, useGame, type DetailType } from './state'

interface Target {
  type: DetailType
  id: string
  x: number
  y: number
  rect: DOMRect
}

const parse = (el: Element | null) => {
  const raw = el?.closest('[data-entity]')?.getAttribute('data-entity')
  if (!raw) return null
  const i = raw.indexOf(':')
  return { type: raw.slice(0, i) as DetailType, id: raw.slice(i + 1), el: el!.closest('[data-entity]')! }
}

export function EntityHover() {
  const [tip, setTip] = useState<Target | null>(null)
  const [menu, setMenu] = useState<Target | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const over = (e: MouseEvent) => {
      const hit = parse(e.target as Element)
      window.clearTimeout(timer.current)
      if (!hit) {
        setTip(null)
        return
      }
      timer.current = window.setTimeout(() => {
        setTip((cur) =>
          cur && cur.type === hit.type && cur.id === hit.id ? cur : { type: hit.type, id: hit.id, x: e.clientX, y: e.clientY, rect: hit.el.getBoundingClientRect() },
        )
      }, 420)
    }
    const context = (e: MouseEvent) => {
      const hit = parse(e.target as Element)
      if (!hit) return
      e.preventDefault()
      setTip(null)
      setMenu({ type: hit.type, id: hit.id, x: e.clientX, y: e.clientY, rect: hit.el.getBoundingClientRect() })
    }
    const hide = () => {
      window.clearTimeout(timer.current)
      setTip(null)
    }
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setMenu(null)
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('contextmenu', context)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('mousedown', hide)
    window.addEventListener('keydown', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('contextmenu', context)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('mousedown', hide)
      window.removeEventListener('keydown', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  return (
    <>
      {tip && !menu && <Tooltip target={tip} />}
      {menu && <ContextMenu target={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

/** Unter dem Element, bei wenig Platz darüber; nie über den Rand */
function Floating({ rect, className, children }: { rect: DOMRect; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 6, ready: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
    const below = rect.bottom + 6
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below
    setPos({ left, top, ready: true })
  }, [rect])
  return (
    <div ref={ref} className={className} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      {children}
    </div>
  )
}

function Tooltip({ target }: { target: Target }) {
  const { index, state } = useGame()
  const { t } = useI18n()
  let body: ReactNode = null

  if (target.type === 'item') {
    const item = index.items.get(target.id)
    if (!item) return null
    const src = rankSources(index, item.id, state.profile)[0]
    const per = src ? yieldOf(src, item.id, state.profile) : 0
    const uses = index.consumers.get(item.id)?.filter((r) => !r.demoLocked).length ?? 0
    const goal = state.items.find((g) => g.item === item.id)
    body = (
      <>
        <Head icon={item.icon} name={item.name} />
        {item.description && <p className="tip-desc">{item.description}</p>}
        <div className="tip-facts">
          {item.sells && (
            <span>
              <GameIcon src={index.currencies.get(item.sells.currency)?.icon} size={13} /> {fmtInt(item.sells.qty)}
            </span>
          )}
          <span>{t('tip.inBank', { n: fmtInt(state.profile.inventory[item.id] ?? 0) })}</span>
          {goal && <span className="ok">{t('tip.inPlan', { n: fmtInt(goal.qty) })}</span>}
          {item.food && <span>{t('detail.heals', { n: item.food.healing })}</span>}
          {item.equipment && <span>{item.equipment.type}</span>}
        </div>
        {src && (
          <div className="tip-line">
            <GameIcon src={src.skill ? index.skills.get(src.skill)?.icon : src.icon} size={14} />
            {recipeAction(t, src)}
            <LevelTag level={src.level} have={src.skill ? (state.profile.levels[src.skill] ?? 1) : 1} />
            {per > 0 && src.timeMs > 0 && <span className="muted">{t('insp.perUnit', { time: fmtDurationShort(actionTime(src, state.profile) / per) })}</span>}
          </div>
        )}
        <div className="tip-foot">
          {t('tip.counts', { sources: index.producers.get(item.id)?.length ?? 0, uses })} · {t('tip.menuHint')}
        </div>
      </>
    )
  } else if (target.type === 'enemy') {
    const e = index.data.enemies?.find((x) => x.id === target.id)
    if (!e) return null
    body = (
      <>
        <Head icon={e.icon} name={e.name} />
        <div className="tip-facts">
          {['MelvorBase:Hitpoints', 'MelvorBase:Attack', 'MelvorBase:Strength', 'MelvorBase:Defence', 'MelvorBase:Ranged', 'MelvorBase:Magic'].map((s) => (
            <span key={s}>
              <GameIcon src={index.skills.get(s)?.icon} size={13} /> {e.levels[s] ?? 1}
            </span>
          ))}
        </div>
        {e.gold && (
          <div className="tip-line">
            <GameIcon src={index.currencies.get(GP)?.icon} size={14} /> {fmtInt(e.gold.min)}–{fmtInt(e.gold.max)} GP
          </div>
        )}
        <div className="tip-foot">{t('tip.menuHint')}</div>
      </>
    )
  } else if (target.type === 'area') {
    const a = index.data.areas?.find((x) => x.id === target.id)
    if (!a) return null
    body = (
      <>
        <Head icon={a.icon ?? 'game/icons/Icons/Combat.webp'} name={a.name} />
        <div className="tip-facts">
          {a.category && <span>{a.category}</span>}
          {a.difficulty && <span>{a.difficulty}</span>}
          <span>{t('tip.monsters', { n: a.enemies.length })}</span>
        </div>
      </>
    )
  } else {
    const p = index.purchases.get(target.id)
    if (!p) return null
    body = (
      <>
        <Head icon={p.icon} name={p.name} />
        {p.description && <p className="tip-desc">{p.description}</p>}
        <div className="tip-facts">
          {p.costs.map((c) => (
            <span key={c.currency}>
              <GameIcon src={index.currencies.get(c.currency)?.icon} size={13} /> {fmtInt(c.qty)}
            </span>
          ))}
          {state.profile.owned[p.id] > 0 && <span className="ok">{t('detail.owned')}</span>}
        </div>
        <div className="tip-foot">{t('tip.menuHint')}</div>
      </>
    )
  }
  return (
    <Floating rect={target.rect} className="tooltip">
      {body}
    </Floating>
  )
}

function Head({ icon, name }: { icon?: string | null; name: string }) {
  return (
    <div className="tip-head">
      <GameIcon src={icon} size={28} />
      <b>{name}</b>
    </div>
  )
}

function ContextMenu({ target, onClose }: { target: Target; onClose: () => void }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])

  const name =
    target.type === 'item'
      ? index.items.get(target.id)?.name
      : target.type === 'enemy'
        ? index.data.enemies?.find((e) => e.id === target.id)?.name
        : target.type === 'area'
          ? index.data.areas?.find((a) => a.id === target.id)?.name
          : index.purchases.get(target.id)?.name
  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const items: (ReactNode | null)[] = [
    <MenuItem key="open" label={t('menu.open')} onClick={act(() => dispatch({ type: 'view', view: { kind: 'detail', type: target.type, id: target.id } }))} />,
  ]
  if (target.type === 'item') {
    const inPlan = state.items.some((g) => g.item === target.id)
    items.push(
      inPlan ? (
        <MenuItem key="rm" label={t('menu.removeFromPlan')} onClick={act(() => dispatch({ type: 'removeItem', item: target.id }))} />
      ) : (
        <MenuItem key="add" label={t('detail.addToPlan')} onClick={act(() => dispatch({ type: 'addItem', item: target.id }))} />
      ),
      <MenuItem key="insp" label={t('menu.inspector')} onClick={act(() => dispatch({ type: 'select', item: target.id }))} />,
    )
  }
  if (target.type === 'purchase') {
    const p = index.purchases.get(target.id)
    const owned = state.profile.owned[target.id] > 0
    if (p && !p.items.length) {
      items.push(
        <MenuItem key="route" label={t('detail.planRoute')} onClick={act(() => dispatch({ type: 'addRoute', route: { id: newId(), kind: 'unlock', purchase: target.id } }))} />,
      )
    }
    items.push(
      <MenuItem key="own" label={t(owned ? 'menu.markNotOwned' : 'menu.markOwned')} onClick={act(() => dispatch({ type: 'setOwned', purchase: target.id, owned: !owned }))} />,
    )
  }
  items.push(<div key="sep" className="menu-sep" />, <MenuItem key="copy" label={t('menu.copyName')} onClick={act(() => navigator.clipboard?.writeText(name ?? ''))} />)

  return (
    <div ref={ref} className="context-menu" style={{ left: Math.min(target.x, window.innerWidth - 220), top: Math.min(target.y, window.innerHeight - 180) }} role="menu">
      <div className="menu-title">{name}</div>
      {items}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="menu-item" role="menuitem" onClick={onClick}>
      {label}
    </button>
  )
}
