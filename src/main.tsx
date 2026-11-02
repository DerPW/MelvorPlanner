import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { buildIndex, type GameIndex } from './core/planner'
import type { GameData } from './core/types'
import { I18nProvider, useT } from './i18n'
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

  if (error) return <NoData error={error} />
  if (!index) return null
  return <App index={index} />
}

function NoData({ error }: { error: string }) {
  const t = useT()
  return (
    <div className="fatal">
      <h1>{t('nodata.title')}</h1>
      <p>
        {t('nodata.before')} <code>pnpm extract</code> {t('nodata.after')}
      </p>
      <p className="muted">{error}</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </StrictMode>,
)
