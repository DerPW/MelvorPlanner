// Lokaler Zugriff auf die Spielstände — für die Live-Verbindung, in jedem
// Browser. Der Dev-Server (und `vite preview`) liefert
//
//   GET /api/saves          → [{ name, mtime, size }] neueste zuerst
//   GET /api/saves/<name>   → die .sav-Datei
//
// Gelesen wird nur aus den Spielstand-Ordnern von Melvor Idle 2, und nur
// Dateien, deren Name wie ein Spielstand aussieht. Der Server lauscht wie
// immer nur auf localhost.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const SAVE_NAME = /^save_[0-9a-f-]+\.sav$/i

function gameRoots(): string[] {
  const home = os.homedir()
  return [
    path.join(home, 'Library/Application Support/Games By Malcs/Melvor Idle 2'),
    path.join(process.env.APPDATA ?? path.join(home, 'AppData/Roaming'), 'Games By Malcs/Melvor Idle 2'),
    path.join(home, '.local/share/Games By Malcs/Melvor Idle 2'),
  ]
}

/** Alle Ordner namens „saves" bis drei Ebenen unter der Spiel-Wurzel (steam/<id>/saves) */
function saveDirs(): string[] {
  const dirs: string[] = []
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const full = path.join(dir, e.name)
      if (e.name === 'saves') dirs.push(full)
      else if (depth < 3 && e.name !== 'shader_cache' && e.name !== 'logs') walk(full, depth + 1)
    }
  }
  for (const root of gameRoots()) walk(root, 0)
  return dirs
}

function listSaves() {
  const out: { name: string; mtime: number; size: number; file: string }[] = []
  for (const dir of saveDirs()) {
    for (const name of fs.readdirSync(dir)) {
      if (!SAVE_NAME.test(name)) continue
      const file = path.join(dir, name)
      try {
        const st = fs.statSync(file)
        out.push({ name, mtime: st.mtimeMs, size: st.size, file })
      } catch {
        // gerade umbenannt (das Spiel schreibt über eine Zwischendatei)
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

const handler: Connect.NextHandleFunction = (req, res, next) => {
  const url = req.url ?? ''
  if (!url.startsWith('/api/saves')) return next()
  const rest = decodeURIComponent(url.slice('/api/saves'.length).split('?')[0]).replace(/^\//, '')
  res.setHeader('Cache-Control', 'no-store')
  if (!rest) {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(listSaves().map(({ name, mtime, size }) => ({ name, mtime, size }))))
    return
  }
  const save = SAVE_NAME.test(rest) ? listSaves().find((s) => s.name === rest) : undefined
  if (!save) {
    res.statusCode = 404
    res.end()
    return
  }
  try {
    const bytes = fs.readFileSync(save.file)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('X-Save-Mtime', String(save.mtime))
    res.end(bytes)
  } catch {
    res.statusCode = 503 // gerade beim Schreiben — beim nächsten Abruf klappt es
    res.end()
  }
}

export function melvorSaves(): Plugin {
  return {
    name: 'melvor-saves',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
