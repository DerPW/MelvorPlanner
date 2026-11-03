#!/usr/bin/env node
// Spieldaten für GitHub Pages: public/game (aus pnpm extract) als Archiv an den
// Release „spieldaten" hängen und die Seite neu bauen lassen. Die Daten gehören
// Games by Malcs / Jagex — deshalb nur dort und auf der Seite, nicht im Repo.
//
//   pnpm extract && pnpm publish-data

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TAG = 'spieldaten'
const root = path.resolve(import.meta.dirname, '..')
const dataFile = path.join(root, 'public/game/data.json')
if (!fs.existsSync(dataFile)) {
  console.error('public/game/data.json fehlt — erst pnpm extract ausführen.')
  process.exit(1)
}
const { gameVersion, packages } = JSON.parse(fs.readFileSync(dataFile, 'utf8')).meta

const run = (cmd, args, env) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
const ok = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// COPYFILE_DISABLE: ohne die ._-Dateien, die macOS-tar sonst für Dateiattribute anlegt
const archive = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'melvor-data-')), 'game.tar.gz')
run('tar', ['-czf', archive, '--exclude', '.DS_Store', '-C', path.join(root, 'public'), 'game'], { COPYFILE_DISABLE: '1' })

const notes = `Aus Melvor Idle 2 extrahiert (\`pnpm extract\`, ${packages.join(', ')} ${gameVersion}) für die GitHub-Pages-Seite des Planers. Eigentum von Games by Malcs / Jagex, nicht Teil des Quellcodes.`
if (ok('gh', ['release', 'view', TAG])) run('gh', ['release', 'edit', TAG, '--notes', notes])
else run('gh', ['release', 'create', TAG, '--title', 'Spieldaten', '--notes', notes, '--prerelease', '--target', 'main'])
run('gh', ['release', 'upload', TAG, archive, '--clobber'])
fs.rmSync(path.dirname(archive), { recursive: true })

if (ok('gh', ['workflow', 'view', 'pages.yml'])) {
  run('gh', ['workflow', 'run', 'pages.yml'])
  console.log('Hochgeladen — die Seite wird neu gebaut (gh run watch).')
} else {
  console.log('Hochgeladen — der Workflow ist noch nicht auf GitHub; die Seite entsteht beim nächsten Push.')
}
