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
    version: '0.9.0',
    date: '2026-11-02',
    de: {
      title: 'Live verfolgen, neue Routen-Ansicht',
      items: [
        'Live-Karte in der Seitenleiste: was im Spiel gerade läuft, gemessen aus dem 10-s-Speichertakt — XP/h, Items/h, Gold/h und wann das nächste Level kommt.',
        'Routen verfolgen: „Verfolgen“ macht eine Route zur aktiven. Sie zeigt, welcher Schritt dran ist, ob du gerade das Richtige machst, und die Restzeit mit deinem echten Tempo; der laufende Schritt ist im Ablauf markiert.',
        'Benachrichtigung, wenn ein Schritt fertig ist und du wechseln musst — und wenn das Ziel erreicht ist (als System-Benachrichtigung, sobald erlaubt, sonst in der Seite).',
        'Routen-Ansicht neu: eine Kopf-Karte mit Ziel, Zeit, Kennzahlen, Bedienung (Verfolgen, Weg ‹ ›, Material) und Live-Status; der Ablauf als nummerierte Zeitleiste aus Phasen-Karten mit mehr Luft, „Alternative“ rechts unter der Zeit.',
      ],
    },
    en: {
      title: 'Live tracking, new route view',
      items: [
        'Live card in the sidebar: what is running in the game, measured from the 10-second save cycle — XP/h, items/h, gold/h and when the next level comes.',
        'Track routes: “Track” makes a route the active one. It shows which step is up, whether you are doing the right thing, and the time left at your real pace; the running step is highlighted in the list.',
        'A notification when a step is done and you need to switch — and when the goal is reached (as a system notification once allowed, otherwise on the page).',
        'Route view redone: a header card with goal, time, figures, controls (Track, way ‹ ›, materials) and live status; the steps as a numbered timeline of phase cards with more room, “Alternative” on the right under the time.',
      ],
    },
  },
  {
    version: '0.8.2',
    date: '2026-11-02',
    de: {
      title: 'Training mit dem Lager',
      items: [
        'Trainingsrouten nehmen Zutaten zuerst aus dem Lager — aber nur so oft, wie es reicht („aus dem Lager“). Ist es leer, wählt der Planer neu: weiter mit Beschaffung oder eine andere Aktivität, wenn die schneller ist.',
        'Beschaffung steht als eigener Schritt da, eingerückt vor dem Training, mit eigener Zeit und Haken — z. B. „175× Raw Shrimp angeln“ vor „Shrimp kochen“. Auch hier: „Alternative ›“.',
      ],
    },
    en: {
      title: 'Training with your bank',
      items: [
        'Training routes take ingredients from your bank first — but only as often as it lasts (“from bank”). When it runs out the planner picks again: keep going with gathering, or another activity if that is faster.',
        'Gathering shows as its own step, indented before the training, with its own time and checkbox — e.g. “175× Raw Shrimp fishing” before “Cook Shrimp”. “Alternative ›” works there too.',
      ],
    },
  },
  {
    version: '0.8.1',
    date: '2026-11-02',
    de: {
      title: 'Alternative je Schritt',
      items: [
        'Jeder Schritt im Ablauf hat „Alternative ›“: nimmt für genau diesen Schritt die nächstbeste Möglichkeit (z. B. Shrimp statt Seed Bait fürs Cooking-Training). „‹“ holt die vorige zurück.',
        'Auch Vorstufen („dafür eine Vorstufe“) lassen sich so einzeln anders beschaffen.',
      ],
    },
    en: {
      title: 'Alternative per step',
      items: [
        'Every step in the list has “Alternative ›”: it takes the next best option for exactly that step (e.g. Shrimp instead of Seed Bait for Cooking training). “‹” brings the previous one back.',
        'Prerequisites (“one prerequisite”) can be sourced differently the same way.',
      ],
    },
  },
  {
    version: '0.8.0',
    date: '2026-11-02',
    de: {
      title: 'Ausrüstungs-Vergleich',
      items: [
        'Neue Ansicht „Ausrüstung“: Jedes passende Teil je Platz wird gegen deine jetzige Ausrüstung gerechnet — an einem Monster deiner Wahl (vorgewählt: das mit den meisten XP).',
        'Wählbar, worauf es ankommt: XP/h, Zeit je Kill, GP/h oder Schaden/h. Neue Waffen werden mit ihrer besten Haltung gerechnet.',
        '„Beste Upgrades“ über alle Plätze, tragbare zuerst; fehlende Level stehen als „braucht …“ daneben, Teile im Lager sind markiert. Rechtsklick → „Route dorthin planen“.',
      ],
    },
    en: {
      title: 'Gear comparison',
      items: [
        'New “Gear” view: every fitting piece per slot is compared with your current gear — against a monster of your choice (preselected: the one with the most XP).',
        'Choose what matters: XP/h, time per kill, GP/h or damage/h. New weapons use their best stance.',
        '“Best upgrades” across all slots, wearable ones first; missing levels show as “needs …”, pieces in your bank are marked. Right-click → “Plan a route there”.',
      ],
    },
  },
  {
    version: '0.7.0',
    date: '2026-11-02',
    de: {
      title: 'Kampf & Monster-Beute, Alternativen',
      items: [
        'Neue Ansicht „Kampf“: Ausrüstung wie im Spiel (aus dem Spielstand oder selbst gewählt), Haltung, Zauber, Essen — und für jedes Monster Trefferchance, Zeit je Kill, XP/h, GP/h, Schaden und Essen je Stunde, Gefahr.',
        'Gerechnet mit den Formeln des Spiels: Treffer gegen Ausweichen, Max Hit, Resistenz, Kampf-Dreieck, Elemente, 3 s Respawn, Auto-Essen; die Angriffe bis zum Kill exakt aus der Schadensverteilung.',
        'Jede Monster-Seite zeigt die Simulation mit deiner Ausrüstung und den Vergleich der Haltungen.',
        'Monster sind echte Quellen: Beute und Gold für Item- und Gold-Routen, Kampf-XP für Level-Routen in Attack, Strength, Defence, Ranged, Magic und Hitpoints — nur sichere Kämpfe, mit Essen als Verbrauch.',
        'Routen: „Weg n ‹ ›“ — › rechnet den nächstbesten Weg ohne die Abzweigung, deren Wegfall am wenigsten kostet, ‹ geht zurück. Einzelne Schritte lassen sich mit ⊘ meiden, Gemiedenes steht als Chip da.',
        'Quellen mit einer Zutat, die es nirgends gibt, rutschen nach hinten.',
      ],
    },
    en: {
      title: 'Combat & monster loot, alternatives',
      items: [
        'New “Combat” view: gear laid out like in the game (from your save or picked yourself), stance, spell, food — and for every monster hit chance, time per kill, XP/h, GP/h, damage and food per hour, danger.',
        'Uses the game’s formulas: accuracy vs evasion, max hit, resistance, combat triangle, elements, 3 s respawn, auto-eat; attacks per kill exactly from the damage distribution.',
        'Every monster page shows the simulation with your gear and compares stances.',
        'Monsters are real sources: loot and gold for item and gold routes, combat XP for level routes in Attack, Strength, Defence, Ranged, Magic and Hitpoints — safe fights only, food counted as consumed.',
        'Routes: “Way n ‹ ›” — › finds the next best way without the branch that costs least to drop, ‹ goes back. Avoid single steps with ⊘; avoided ones show as chips.',
        'Sources needing an ingredient that exists nowhere drop to the back.',
      ],
    },
  },
  {
    version: '0.6.1',
    date: '2026-11-02',
    de: {
      title: 'Freischaltungen',
      items: [
        'Skills, Shop und Bank sind gesperrt, bis ihre Bedingungen erfüllt sind — z. B. Thieving erst mit Cooking 10, Cooking erst nach 20 geangelten Raw Shrimp. Routen schalten den Weg dorthin selbst frei und zeigen „Thieving freischalten" als eigenen Schritt.',
        'Bedingungen, die der Planer noch nicht rechnet (ein Monster besiegen, ein Tier fangen), stehen als Aufgabe im Ablauf.',
        'Gesperrte Skills tragen ein Schloss in der Seitenleiste; die Skill-Seite und der Tooltip sagen, was fehlt. Im Profil lässt sich der Stand je Skill von Hand festlegen.',
        'Vogelnester, Geoden und andere Behälter sind jetzt echte Quellen: Holzfällen bringt Vogelnester und Baumsamen, Bergbau Geoden, und Öffnen liefert den Inhalt — Kartoffelsamen kommen so aus Vogelnestern statt per Thieving 35.',
      ],
    },
    en: {
      title: 'Unlocks',
      items: [
        'Skills, the shop and the bank stay locked until their conditions are met — e.g. Thieving needs Cooking 10, Cooking needs 20 Raw Shrimp fished. Routes unlock the way there on their own and show “Unlock Thieving” as a step.',
        'Conditions the planner does not calculate yet (defeat a monster, trap an animal) appear as a task in the steps.',
        'Locked skills carry a lock in the sidebar; the skill page and tooltip say what is missing. The profile lets you set each skill by hand.',
        'Bird nests, geodes and other containers are real sources now: woodcutting yields bird nests and tree seeds, mining yields geodes, and opening gives the contents — potato seeds come from bird nests instead of Thieving 35.',
      ],
    },
  },
  {
    version: '0.6.0',
    date: '2026-11-02',
    de: {
      title: 'Alles ist eine Route',
      items: [
        'Item, Level, Gold oder Freischaltung: Jedes Ziel ist jetzt eine eigene Route in der Seitenleiste, mit dem ganzen Weg dorthin — auch dem, was vorher nötig ist.',
        'Der gemeinsame Crafting-Plan ist in den Item-Routen aufgegangen; gespeicherte Items werden übernommen. Item-Routen zeigen Ablauf, Baum und Material, die Menge steht direkt in der Route.',
        'Neue Übersicht „Routen": neue Route anlegen (Item direkt suchen), deine Routen, Ideen für deinen Stand.',
        'Brotkrumen-Leiste: Folgst du Verweisen von Seite zu Seite, steht oben der Pfad — jede Station anklickbar.',
        'Alles mit Detailseite ist klickbar, mit Tooltip und Kontextmenü — Icons wie Texte, auch „braucht X" und die Begründungen im Ablauf. Skills haben jetzt ebenfalls Tooltip und Menü.',
        'Shop-Käufe als Quelle zeigen, in welcher Shop-Kategorie sie stehen.',
        'Tabellen kürzen Werte nicht mehr unnötig; Suche und „+"-Menü liegen sauber über der Oberfläche.',
      ],
    },
    en: {
      title: 'Everything is a route',
      items: [
        'Item, level, gold or unlock: every goal is now its own route in the sidebar, with the whole way there — including what has to happen first.',
        'The shared crafting plan has become item routes; saved items carry over. Item routes show steps, tree and materials, with the amount right in the route.',
        'New “Routes” overview: create a route (search an item right there), your routes, ideas for where you are.',
        'Breadcrumb bar: follow links from page to page and the path shows at the top — every stop clickable.',
        'Everything with a detail page is clickable, with tooltip and context menu — icons and text alike, including “needs X” and the reasons in the steps. Skills now have a tooltip and menu too.',
        'Shop purchases used as a source show which shop category they are in.',
        'Tables no longer cut values short; search and the “+” menu sit cleanly on top.',
      ],
    },
  },
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
