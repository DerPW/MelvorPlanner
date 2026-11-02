import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { buildIndex, type GameIndex } from './core/planner'
import type { GameData } from './core/types'
import { App } from './ui/App'
import './ui/styles.css'

function Root() {
  const [index, setIndex] = useState<GameIndex | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('game/data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<GameData>
      })
      .then((data) => setIndex(buildIndex(data)))
      .catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="fatal">
        <h1>Keine Spieldaten gefunden</h1>
        <p>
          Die Daten kommen aus deiner Melvor-Idle-2-Installation. Einmal <code>pnpm extract</code> ausführen und die
          Seite neu laden.
        </p>
        <p className="muted">{error}</p>
      </div>
    )
  }
  if (!index) return null
  return <App index={index} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
