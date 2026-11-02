import { useEffect, useMemo, useRef, useState } from 'react'
import type { Id } from '../core/types'
import { GameIcon, Sym } from './components'
import { useGame } from './state'

/** Suchfeld mit Ergebnisliste; ⌘K springt hinein (nur eines je Seite mit `shortcut`) */
export function ItemSearch({
  onPick,
  placeholder = 'Item suchen',
  shortcut = false,
  width,
}: {
  onPick: (item: Id) => void
  placeholder?: string
  shortcut?: boolean
  width?: number
}) {
  const { index } = useGame()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    const hits = index.data.items.filter((i) => i.name.toLowerCase().includes(term))
    hits.sort((a, b) => {
      const sa = a.name.toLowerCase().startsWith(term) ? 0 : 1
      const sb = b.name.toLowerCase().startsWith(term) ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name)
    })
    return hits.slice(0, 30)
  }, [q, index])

  const pick = (id: Id) => {
    onPick(id)
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className="search" ref={wrap} style={width ? { width } : undefined}>
      <Sym name="search" size={15} className="sym-lead" />
      <input
        ref={input}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(results.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if ((e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) && results[active]) {
            e.preventDefault()
            pick(results[active].id)
          } else if (e.key === 'Escape') {
            setOpen(false)
            input.current?.blur()
          }
        }}
      />
      {shortcut && !q && <kbd>⌘K</kbd>}
      {open && q.trim() && (
        <div className="popover" role="listbox">
          {results.length === 0 && <div className="pop-empty">Kein Item gefunden</div>}
          {results.map((item, i) => {
            const via = [...new Set((index.producers.get(item.id) ?? []).filter((r) => !r.demoLocked).map((r) => r.skill).filter(Boolean))]
            const locked = (index.producers.get(item.id) ?? []).every((r) => r.demoLocked)
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={i === active}
                className={`pop-row ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item.id)}
              >
                <GameIcon src={item.icon} size={22} />
                <span className="grow">{item.name}</span>
                {locked && (index.producers.get(item.id)?.length ?? 0) > 0 && <span className="tag locked">Demo</span>}
                <span className="via">
                  {via.slice(0, 3).map((s) => (
                    <GameIcon key={s} src={index.skills.get(s!)?.icon} size={14} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
