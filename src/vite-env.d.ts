/// <reference types="vite/client" />

/** Version aus package.json (vite.config.ts) */
declare const __APP_VERSION__: string

/** false, wenn statisch ausgeliefert (GitHub Pages) — dann gibt es /api/saves nicht */
declare const __LIVE_SERVER__: boolean
