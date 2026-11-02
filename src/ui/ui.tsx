import { createContext, useContext } from 'react'

/** App-weite Fenster (Sheets), die von überall geöffnet werden — Suche,
 *  Kontextmenü, Profil */
export interface Ui {
  openImport: () => void
  openNotes: () => void
}

export const UiContext = createContext<Ui>({ openImport: () => {}, openNotes: () => {} })
export const useUi = () => useContext(UiContext)

/** Globale Suche fokussieren (Knopf „Item hinzufügen" im Plan) */
export const focusSearch = () => window.dispatchEvent(new Event('melvor:focus-search'))
