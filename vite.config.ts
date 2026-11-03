import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }
import { melvorSaves } from './scripts/vite-save-plugin'

// GitHub Pages (.github/workflows/pages.yml) baut mit PAGES_BASE=/<repo>/: Die
// Seite liegt unter diesem Pfad, und ohne lokalen Server gibt es keine Live-Verbindung
const pagesBase = process.env.PAGES_BASE

export default defineConfig({
  base: pagesBase ?? '/',
  plugins: [react(), melvorSaves()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __LIVE_SERVER__: JSON.stringify(!pagesBase),
  },
  server: { port: 5178 },
  // brotli-wasm lädt seine .wasm über import.meta.url — nicht vorbündeln
  optimizeDeps: { exclude: ['brotli-wasm'] },
})
