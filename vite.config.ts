import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { melvorSaves } from './scripts/vite-save-plugin'

export default defineConfig({
  plugins: [react(), melvorSaves()],
  server: { port: 5178 },
})
