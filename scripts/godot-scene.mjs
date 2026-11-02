// Godot-Szenen (binäres RSRC, .scn) lesen — gerade genug, um aus den
// Tutorial-Fenstern des Spiels Texte, Bilder und Sichtbarkeit zu holen.
// Aufbau wie ResourceFormatLoaderBinary: Kopf, Zeichenkettentabelle, externe
// und interne Ressourcen; die PackedScene trägt ihren Baum in `_bundled`.

export function parseScene(buf) {
  let pos = 0
  const u32 = () => ((pos += 4), buf.readUInt32LE(pos - 4))
  const i32 = () => ((pos += 4), buf.readInt32LE(pos - 4))
  const u64 = () => ((pos += 8), Number(buf.readBigUInt64LE(pos - 8)))
  const f32 = (n) => Array.from({ length: n }, () => ((pos += 4), buf.readFloatLE(pos - 4)))
  const f64 = (n) => Array.from({ length: n }, () => ((pos += 8), buf.readDoubleLE(pos - 8)))
  const ustr = () => {
    const l = u32()
    const s = buf.toString('utf8', pos, pos + l).replace(/\0+$/, '')
    pos += l
    return s
  }
  if (buf.toString('ascii', 0, 4) !== 'RSRC') throw new Error('keine RSRC-Szene')
  pos = 4
  u32() // big endian
  u32() // 64-bit reals
  u32() // Version Major
  u32() // Minor
  u32() // Format
  ustr() // Ressourcentyp
  u64() // Import-Metadaten
  const flags = u32()
  u64() // UID
  if (flags & 8) ustr() // Skriptklasse
  // Reservierte Felder: so viele u32, bis eine plausible Zeichenkettentabelle beginnt
  const after = pos
  for (const r of [11, 10, 9, 12, 13]) {
    pos = after + 4 * r
    const n = buf.readUInt32LE(pos)
    if (n <= 0 || n >= 5000) continue
    let p = pos + 4
    let ok = true
    for (let i = 0; i < n; i++) {
      const l = buf.readUInt32LE(p)
      if (l > 10000) {
        ok = false
        break
      }
      p += 4 + l
    }
    if (ok) break
  }
  const strings = Array.from({ length: u32() }, ustr)
  const ext = Array.from({ length: u32() }, () => {
    const type = ustr()
    const path = ustr()
    if (flags & 2) u64()
    return { type, path }
  })
  const ints = Array.from({ length: u32() }, () => ({ path: ustr(), offset: u64() }))
  const real = flags & 4 ? f64 : f32

  const gstr = () => {
    const id = u32()
    if (id & 0x80000000) {
      const l = id & 0x7fffffff
      const s = buf.toString('utf8', pos, pos + l).replace(/\0+$/, '')
      pos += l
      return s
    }
    return strings[id]
  }
  const variant = () => {
    const t = u32()
    switch (t) {
      case 1:
        return null
      case 2:
        return u32() !== 0
      case 3:
        return i32()
      case 4:
        return f32(1)[0]
      case 5:
        return ustr()
      case 10:
        return real(2)
      case 11:
      case 13:
      case 14:
        return real(4)
      case 12:
        return real(3)
      case 15:
      case 18:
        return real(6)
      case 16:
        return real(9)
      case 17:
        return real(12)
      case 20:
        return { color: f32(4) }
      case 22: {
        const names = buf.readUInt16LE(pos)
        const subs = buf.readUInt16LE(pos + 2) & 0x7fff
        pos += 4
        const parts = Array.from({ length: names }, gstr)
        const sub = Array.from({ length: subs }, gstr)
        return { nodepath: parts.join('/') + (sub.length ? ':' + sub.join(':') : '') }
      }
      case 23:
        return { rid: u32() }
      case 24: {
        const ot = u32()
        if (ot === 0) return null
        if (ot === 1) return { ext: [ustr(), ustr()] }
        if (ot === 2) return { int: u32() }
        if (ot === 3) {
          const i = u32()
          return { extres: ext[i]?.path ?? i }
        }
        throw new Error(`Objekt-Art ${ot}`)
      }
      case 26: {
        const n = u32() & 0x7fffffff
        const d = {}
        for (let i = 0; i < n; i++) {
          const k = variant()
          d[String(k)] = variant()
        }
        return d
      }
      case 30:
        return Array.from({ length: u32() & 0x7fffffff }, variant)
      case 31: {
        const l = u32()
        pos += l + ((4 - (l % 4)) % 4)
        return { bytes: l }
      }
      case 32:
        return Array.from({ length: u32() }, i32)
      case 33:
        return f32(u32())
      case 34:
        return Array.from({ length: u32() }, ustr)
      case 35:
        return real(3 * u32()) && null
      case 36:
        return f32(4 * u32()) && null
      case 37:
        return real(2 * u32()) && null
      case 40:
        pos += 8
        return Number(buf.readBigInt64LE(pos - 8))
      case 41:
        return f64(1)[0]
      case 44:
        return { stringName: ustr() }
      default:
        throw new Error(`Variant-Typ ${t}`)
    }
  }

  for (const r of ints) {
    pos = r.offset
    const type = ustr()
    if (type !== 'PackedScene') continue
    const props = {}
    const count = u32()
    for (let i = 0; i < count; i++) {
      const name = strings[u32()]
      props[name] = variant()
    }
    const b = props._bundled
    if (!b?.nodes) continue
    const { names, variants, nodes } = b
    const tree = []
    let i = 0
    for (let n = 0; n < b.node_count; n++) {
      const [parent, , type, name] = nodes.slice(i, i + 5)
      i += 5
      const pc = nodes[i++]
      const p = {}
      for (let k = 0; k < pc; k++) {
        p[names[nodes[i] & 0xffffff]] = variants[nodes[i + 1]]
        i += 2
      }
      i += 1 + nodes[i]
      tree.push({ parent, type: names[type] ?? type, name: names[name & 0xffffff], props: p })
    }
    return tree
  }
  return []
}

/** Tutorial-Fenster eines Skills: Schwierigkeit (Zitronen, im Kampf „von … bis …“),
 *  Hinweise, Abschnitte aus Titel und Text (BBCode) — nur, was im Spiel
 *  sichtbar ist. Reiter-Seiten (Kampf) zählen als sichtbar, ihr Name wird zur Gruppe. */
export function tutorialOf(tree) {
  const kids = (i) => tree.filter((m) => m.parent === i)
  // Reiter: ausgeblendete PanelContainer neben weiteren PanelContainern
  const page = (i) => tree[i].type === 'PanelContainer' && tree[i].props.visible === false && kids(tree[i].parent).filter((m) => m.type === 'PanelContainer').length > 1
  const visible = (i) => i < 0 || ((tree[i].props.visible !== false || page(i)) && visible(tree[i].parent))
  const pageOf = (i) => (i < 0 ? null : page(i) ? tree[i].name : pageOf(tree[i].parent))
  const tex = (n) => n.props.texture?.extres ?? ''
  const isLemon = (n, i) => n.type === 'TextureRect' && /Lemon\.png$/.test(tex(n)) && visible(i)
  const black = (n) => n.props.modulate?.color?.slice(0, 3).every((c) => c === 0)
  // Zitronen je Behälter — eine Gruppe, im Kampf zwei („von … bis …“)
  const groups = new Map()
  tree.forEach((n, i) => {
    if (!isLemon(n, i)) return
    const g = groups.get(n.parent) ?? { filled: 0, total: 0 }
    g.total++
    if (!black(n)) g.filled++
    groups.set(n.parent, g)
  })
  const difficultyRows = new Set([...groups.keys()].map((c) => tree[c].parent))
  const sections = []
  const used = new Set()
  tree.forEach((n, i) => {
    if (n.type !== 'RichTextLabel' || !visible(i) || !n.props.text) return
    // Titel: das Label davor im selben Behälter
    const title = tree
      .map((m, j) => [m, j])
      .filter(([m, j]) => m.parent === n.parent && j < i && m.type === 'Label' && visible(j))
      .at(-1)
    if (title) used.add(title[1])
    sections.push({ group: pageOf(i), title: title?.[0].props.text ?? '', body: n.props.text })
  })
  // Hinweise: sichtbare Labels außerhalb der Abschnitte, ohne Kopf- und Schwierigkeitszeile
  const notes = []
  tree.forEach((n, i) => {
    if (n.type !== 'Label' || used.has(i) || !visible(i) || !n.props.text || n.props.text === 'X') return
    if (difficultyRows.has(n.parent)) return
    if (kids(n.parent).some((m) => m.type === 'TextureRect')) return // Titelzeile mit Skill-Symbol
    if (n.props.text === 'Welcome to') return
    if (pageOf(i)) return // Überschriften in Reitern ohne eigenen Text
    notes.push(n.props.text)
  })
  return { difficulty: [...groups.values()], notes, sections }
}
