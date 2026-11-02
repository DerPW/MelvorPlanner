import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }
import { melvorSaves } from './scripts/vite-save-plugin'

export default defineConfig({
  plugins: [react(), melvorSaves()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5178 },
})
