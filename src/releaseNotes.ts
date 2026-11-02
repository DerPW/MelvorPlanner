// Release Notes — neueste zuerst. Die Version kommt aus package.json
// (__APP_VERSION__); bei einem Sprung öffnen sie sich einmal von selbst.

export interface ReleaseNote {
  version: string
  date: string
  de: { title: string; items: string[] }
  en: { title: string; items: string[] }
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.5.0',
    date: '2026-11-02',
    de: {
      title: 'Schlauere Routen, globale Suche, Detailseiten, Deutsch & Englisch',
      items: [
        'Routen probieren Upgrades (z. B. Spitzhacken) und Umwege komplett durch und nehmen den schnellsten Weg.',
        'Bei Items mit mehreren Quellen wird die schnellste gewählt — z. B. kaufen statt 40 Level trainieren.',
        'Boni, die unterwegs gekauft werden, gelten ab dem Kauf.',
        'Der schnellste Weg steht oben im Plan; im Baum zeigt „nach Schritt N", welcher Schritt eine Quelle freischaltet.',
        'Deutsch und Englisch — erkennt die Sprache des Browsers, umstellbar im Profil und unten in der Seitenleiste.',
        'Versionsanzeige und diese Release Notes.',
        'Dezente Animationen beim Umschalten und Wechseln der Ansichten.',
        'Globale Suche (⌘K) für alles: Items, Skills, Monster, Gebiete, Shop, Rezepte — und Ansichten und Aktionen.',
        'Detailseiten für Items, Monster, Gebiete und Shop-Käufe mit allen Infos: Quellen inkl. Monster-Beute und Truhen, Verwendung, Ausrüstungswerte, Boni.',
        'Tooltips und Kontextmenü (Rechtsklick) überall, wo ein Item, Monster oder Upgrade auftaucht.',
        'Items und Routen lassen sich in der Seitenleiste per × entfernen; die Suche fügt nicht mehr direkt hinzu, sondern öffnet die Detailseite.',
      ],
    },
    en: {
      title: 'Smarter routes, global search, detail pages, German & English',
      items: [
        'Routes try upgrades (e.g. pickaxes) and detours end to end and take the fastest way.',
        'For items with several sources the fastest one wins — e.g. buying instead of training 40 levels.',
        'Bonuses bought along the way apply from the moment of purchase.',
        'The fastest path sits at the top of the plan; in the tree, “after step N” shows which step unlocks a source.',
        'German and English — follows the browser language, switchable in the profile and at the bottom of the sidebar.',
        'Version display and these release notes.',
        'Subtle animations when toggling controls and switching views.',
        'Global search (⌘K) for everything: items, skills, monsters, areas, shop, recipes — plus views and actions.',
        'Detail pages for items, monsters, areas and shop purchases with everything known: sources incl. monster loot and chests, uses, equipment stats, bonuses.',
        'Tooltips and a context menu (right-click) wherever an item, monster or upgrade shows up.',
        'Remove items and routes from the sidebar with ×; search no longer adds right away but opens the detail page.',
      ],
    },
  },
  {
    version: '0.4.0',
    date: '2026-11-02',
    de: {
      title: 'Boni & Live-Verbindung',
      items: [
        'Shop-Käufe, Werkzeuge und Gilden-Ränge gehen in alle Zeiten, Mengen und Raten ein — mit den Formeln des Spiels.',
        'Live-Verbindung: liest den Spielstand neu ein, sobald das Spiel speichert — in jedem Browser.',
      ],
    },
    en: {
      title: 'Bonuses & live connection',
      items: [
        'Shop purchases, tools and guild ranks feed into every time, amount and rate — using the game’s own formulas.',
        'Live connection: re-reads your save as soon as the game saves — in any browser.',
      ],
    },
  },
  {
    version: '0.3.0',
    date: '2026-11-02',
    de: {
      title: 'Spielstand-Import',
      items: ['Spielstand als .sav-Datei oder Export-Text einlesen: Level, XP, Bank, Gold, Käufe, Werkzeuge.'],
    },
    en: {
      title: 'Save import',
      items: ['Import a save as .sav file or export string: levels, XP, bank, gold, purchases, tools.'],
    },
  },
  {
    version: '0.2.0',
    date: '2026-11-02',
    de: {
      title: 'Routen für Level, Gold und Freischaltungen',
      items: [
        'Neue Ziele: Level erreichen, Gold verdienen, Shop-Freischaltung kaufen.',
        'Der Planer löst Anforderungen selbst auf — auch über andere Skills (z. B. Samen nur per Thieving).',
      ],
    },
    en: {
      title: 'Routes for levels, gold and unlocks',
      items: [
        'New goals: reach a level, earn gold, buy a shop unlock.',
        'The planner resolves requirements on its own — even across skills (e.g. seeds only via Thieving).',
      ],
    },
  },
  {
    version: '0.1.0',
    date: '2026-11-02',
    de: {
      title: 'Crafting-Plan',
      items: ['Items bis zum Rohstoff heruntergerechnet: Ablauf, Baum, Material, Zeit, Gold, XP.'],
    },
    en: {
      title: 'Crafting plan',
      items: ['Items broken down to raw materials: steps, tree, materials, time, gold, XP.'],
    },
  },
]
