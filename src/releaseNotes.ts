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
    version: '0.14.0',
    date: '2026-11-03',
    de: {
      title: 'Optimale Ausrüstung für Skills',
      items: [
        'Ausrüstung → neuer Reiter „Skills“: belegt den Werkzeuggürtel eines Skills optimal für eine Aktion — nach XP/h, Menge/h oder GP/h, aus dem Lager, tragbar oder aus allen Items. Je Platz (Werkzeug, Handschuhe, Helm, Zubehör …) das empfohlene Item mit seinen Boni, ob du es schon hast, was es zum Anlegen braucht, und „Planen“ für die Route dorthin.',
        'Gerechnet wird mit denselben Formeln wie die Boni, für die gewählte Aktion — alle Kombinationen werden probiert. Vorbelegt ist die Aktion, die gerade läuft, sonst die höchste freie.',
        'Skill-Seiten haben dafür den Knopf „Ausrüstung“.',
      ],
    },
    en: {
      title: 'Optimal gear for skills',
      items: [
        'Gear → new “Skills” tab: fills a skill’s toolbelt optimally for an action — by XP/h, amount/h or GP/h, from your bank, wearable or from all items. Per slot (tool, gloves, helmet, utility …) the recommended item with its bonuses, whether you have it, what it needs to equip, and “Plan” for a route to it.',
        'Calculated with the same formulas as bonuses, for the chosen action — every combination is tried. The running action is preselected, otherwise the highest unlocked one.',
        'Skill pages have a “Gear” button for it.',
      ],
    },
  },
  {
    version: '0.13.1',
    date: '2026-11-03',
    de: {
      title: 'Eigene Seiten für Aktionen und NPCs',
      items: [
        'Neu: Detailseite für jede Aktion — einen Baum, Fischplatz, Felsen, NPC zum Bestehlen oder ein Rezept. Mit Level, Zeit, XP, Erfolgschance und Wahrnehmung, Zutaten, dem Ergebnis samt Beutetabellen (gewöhnlich, selten, nebenbei) mit Chancen, den Werten und Boni wie im Spiel und den Mastery-Aufgaben zu dieser Aktion.',
        'Quellen verlinken jetzt auf ihre Aktions-Seite statt aufs erste Produkt — „Thug bestehlen“ führt zum Thug, nicht zu einem zufälligen Beute-Item. Auch die laufende Aktion in der Live-Ansicht führt dorthin.',
        'Wiki: neue Art „Aktionen“, nach Skill gruppiert.',
      ],
    },
    en: {
      title: 'Pages for actions and NPCs',
      items: [
        'New: a detail page for every action — a tree, fishing spot, rock, NPC to pickpocket or a recipe. With level, time, XP, success chance and perception, ingredients, the result including loot tables (common, rare, extra) with chances, the stats and bonuses like in the game and the mastery tasks for this action.',
        'Sources now link to their action page instead of the first product — “Pickpocket Thug” opens the Thug, not a random loot item. The running action in the live view goes there too.',
        'Wiki: new kind “Actions”, grouped by skill.',
      ],
    },
  },
  {
    version: '0.13.0',
    date: '2026-11-03',
    de: {
      title: 'Spielstand-Editor',
      items: [
        'Neu: Spielstand-Editor (Seitenleiste unter „Dein Spiel“). Einen Spielstand laden — aus der Live-Verbindung, als .sav-Datei oder als Export-Text —, dann Währungen, Skill-Level/XP, Bank-Bestände und Shop-Käufe ändern.',
        'Bearbeitet wird nur, was der Rundlauf-Test erlaubt: Der Spielstand wird zerlegt und unverändert wieder zusammengesetzt — nur wenn das Byte für Byte dasselbe ergibt, ist Ändern frei. Alles, was der Editor nicht kennt, bleibt unverändert.',
        'Heraus kommt ein neuer Spielstand, der zur Kontrolle wieder eingelesen wird — als Datei zum Herunterladen oder als Import-Text fürs Spiel. In den Spielordner wird nie geschrieben.',
      ],
    },
    en: {
      title: 'Save editor',
      items: [
        'New: save editor (sidebar under “Your game”). Load a save — from the live connection, as a .sav file or as export text — then change currencies, skill levels/XP, bank stock and shop purchases.',
        'Editing is only allowed when the round trip passes: the save is split and rebuilt unchanged — only if that is identical byte for byte can you edit. Everything the editor doesn’t know stays untouched.',
        'The result is a new save, read back as a check — as a file to download or as import text for the game. Nothing is ever written to the game folder.',
      ],
    },
  },
  {
    version: '0.12.0',
    date: '2026-11-03',
    de: {
      title: 'Mastery, Statistiken, Guide und Quests',
      items: [
        'Mastery: je Skill die Mastery Guild wie im Spiel — Rangleiter mit den Punkten ab jedem Rang und seinen Boni, die Aufgaben je Kategorie mit Fortschritt aus dem Spielstand, offen/erledigt filterbar, „Planen“ für Aufgaben mit Item. Die Übersicht zeigt alle Gilden mit Rang und Punkten bis zum nächsten.',
        'Statistiken: je Skill und Bereich (Charakter, Bank, Shop, Kampf …) die Werte wie im Spiel-Menü — Zeiten, Zähler, Währungen — und zusätzlich, welche Items gewonnen, verbraucht, gefunden oder verkauft wurden.',
        'Guide: die Erklärungen des Spiels je Skill mit Schwierigkeit in Zitronen; der Kampf-Guide mit seinen Reitern.',
        'Quests: Akt 1 der Demo mit Zustand je Quest, den Schritten, Zielen mit Fortschritt, Abgaben mit Lagerbestand und „Planen“, Belohnungen und den Dialogen zum Aufklappen. Freigeschaltet ab Smithing, Fletching und Runecrafting Level 5 — vorher mit Schloss.',
        'Skill-Seiten haben die Knöpfe Mastery, Statistiken und Guide wie im Spiel.',
        'Live: Die laufende Aktion verlinkt nur noch auf ein Item, wenn sie genau ein festes Produkt hat — beim Thieving (Beutetabelle) auf die Skill-Seite statt auf den ersten Beute-Eintrag.',
      ],
    },
    en: {
      title: 'Mastery, statistics, guide and quests',
      items: [
        'Mastery: each skill’s Mastery Guild like in the game — the rank ladder with the points each rank needs and its bonuses, the tasks per category with progress from your save, filterable open/done, “Plan” for tasks with an item. The overview shows every guild with its rank and points to the next.',
        'Statistics: per skill and area (character, bank, shop, combat …) the values of the in-game menu — times, counters, currencies — plus which items were gained, used, found or sold.',
        'Guide: the game’s explanations per skill with the lemon difficulty; the combat guide with its tabs.',
        'Quests: Act 1 of the demo with each quest’s state, its steps, goals with progress, hand-ins with your stock and “Plan”, rewards and collapsible dialogue. Unlocked at Smithing, Fletching and Runecrafting level 5 — locked until then.',
        'Skill pages have the Mastery, Statistics and Guide buttons like in the game.',
        'Live: the running action only links to an item when it has exactly one fixed product — for thieving (loot table) to the skill page instead of the first loot entry.',
      ],
    },
  },
  {
    version: '0.11.9',
    date: '2026-11-02',
    de: {
      title: 'Essen im Live, Gilden-Rang aus dem Spielstand',
      items: [
        'Live: Das gewählte Essen zählt als Verbrauch — beim Thieving und im Kampf wird es automatisch aus der Bank gegessen. Eigene Kachel „Essen reicht noch“ mit Uhrzeit und eine Benachrichtigung, wenn es aufgebraucht ist (die Aktion läuft dann weiter, nur ohne Heilung).',
        'Der Gilden-Rang je Skill kommt jetzt aus deinem Mastery-Fortschritt im Spielstand — so, wie das Spiel ihn beim Laden rechnet. Damit stimmen die Rang-Boni ohne Einstellen von Hand.',
      ],
    },
    en: {
      title: 'Food in live view, guild rank from your save',
      items: [
        'Live: your selected food counts as consumption — thieving and combat eat it from the bank automatically. A separate “Food lasts” tile with the clock time, and a notification when it runs out (the action keeps going, just without healing).',
        'Each skill’s guild rank now comes from the mastery progress in your save — computed the way the game does on load. Rank bonuses are right without setting them by hand.',
      ],
    },
  },
  {
    version: '0.11.8',
    date: '2026-11-02',
    de: {
      title: 'Nur kaufen, was es im Shop gibt; Münzen im Baum',
      items: [
        'Der Planer schlägt nur noch Käufe vor, die im Spiel-Shop wirklich stehen. 41 Käufe stehen zwar in den Spieldaten, aber nicht in der Shop-Liste — darunter Cowhide, Green Dragonhide, der Grain Starter Pack, Banana- und Apple-Tree-Samen und die alten Äxte, Spitzhacken und Angeln. Sie gelten jetzt als gesperrt.',
        'Baum: Was gekauft oder gegen Münzen hergestellt wird, zeigt die Kosten für die ganze Menge — rot, wenn dein Gold gerade nicht reicht.',
        'Ablauf: „verbraucht“ nennt auch die Münzen eines Schritts.',
      ],
    },
    en: {
      title: 'Only buy what the shop has; coins in the tree',
      items: [
        'The planner only suggests purchases that are really in the in-game shop. 41 purchases exist in the game data but not in the shop list — among them Cowhide, Green Dragonhide, the Grain Starter Pack, Banana and Apple tree seeds and the old axes, pickaxes and rods. They now count as locked.',
        'Tree: anything bought or made for coins shows the cost for the whole amount — red when your gold is not enough right now.',
        'Flow: “uses” also lists a step’s coins.',
      ],
    },
  },
  {
    version: '0.11.7',
    date: '2026-11-02',
    de: {
      title: 'Eine Zeit statt zwei',
      items: [
        'Route: Hat ein Abschnitt nur einen Schritt, steht die Zeit nur noch am Schritt, nicht doppelt im Kopf.',
        'Läuft ein Schritt gemessen, zählt auch die Zeit im Kopf seines Abschnitts mit — Kopf und Schritt rechnen jetzt mit derselben Messung.',
        'Die Messung ist anfangs mit dem Plan gemittelt und gilt nach 2 Minuten ganz: In den ersten Sekunden macht eine Aktion mehr oder weniger sonst schnell 20 % aus.',
        'Bringt der laufende Schritt laut Messung keinen Fortschritt (z. B. eine Kampfhaltung, die einen anderen Skill trainiert), steht dort „kein Fortschritt gemessen“ statt „misst …“.',
        'Seitenleiste: kein Live-Badge mehr an „Einstellungen“ — den Stand zeigt der Punkt an „Live“, bei einem Lesefehler mit Hinweis.',
      ],
    },
    en: {
      title: 'One time instead of two',
      items: [
        'Route: when a section has a single step, its time is shown only at the step, not twice in the header.',
        'While a step runs measured, the time in its section header counts along — header and step now use the same measurement.',
        'The measurement is blended with the plan at first and fully counts after 2 minutes: in the first seconds, one action more or less easily makes 20 %.',
        'When the running step shows no measured progress (e.g. a combat stance training another skill), it says “no progress measured” instead of “measuring …”.',
        'Sidebar: no live badge on “Settings” any more — the dot on “Live” shows the state, with a hint on read errors.',
      ],
    },
  },
  {
    version: '0.11.6',
    date: '2026-11-02',
    de: {
      title: 'Ruhigere Markierung',
      items: ['Der laufende Schritt einer verfolgten Route ist jetzt getönt statt mit einem farbigen Rand links markiert.'],
    },
    en: {
      title: 'Calmer highlight',
      items: ['The running step of a tracked route is now tinted instead of marked with a coloured bar on the left.'],
    },
  },
  {
    version: '0.11.5',
    date: '2026-11-02',
    de: {
      title: 'Aus der Live-Ansicht zum Monster',
      items: [
        'In der Live-Ansicht ist der Name der laufenden Aktion ein Link — im Kampf zur Seite des Monsters, sonst zum Item oder Skill. Die Live-Karte in der Seitenleiste öffnet immer die Live-Ansicht.',
        'Auf der Seite des Monsters, gegen das du gerade kämpfst, steht oben „Du kämpfst gerade gegen dieses Monster“ mit dem Weg zurück in die Live-Ansicht.',
      ],
    },
    en: {
      title: 'From the live view to the monster',
      items: [
        'In the live view, the name of the running action is a link — to the monster’s page in combat, otherwise to the item or skill. The live card in the sidebar always opens the live view.',
        'The page of the monster you are fighting says “You are fighting this monster right now” at the top, with a link back to the live view.',
      ],
    },
  },
  {
    version: '0.11.3',
    date: '2026-11-02',
    de: {
      title: 'Werte wie im Spiel-Panel',
      items: [
        'Live: Die Karte „Werte“ zeigt für jede Aktion, was das Spiel dazu anzeigt — Grundwert und mit Boni: Intervall, Zutaten bewahren, Chance auf doppelt, Nebenprodukt (Feuermachen), Kochkunst und Schwierigkeit, beim Holzfällen Baum-Lebenspunkte, sofort fällen, Schwachstelle und doppelter Schaden, beim Bergbau Bruchchance und Zertrümmern, beim Angeln kürzeste und längste Wurfzeit und Fischchance, beim Thieving Wahrnehmung, Betäubung und Beutechancen, dazu XP-Boni. Werte, die ein Bonus verbessert, sind grün.',
        'Live im Kampf: Kampfwerte wie auf der Monster-Seite — Trefferchance, Schaden, Zeit je Kill, Kills/h, wie oft und wie hart das Monster trifft, Essen/h und XP/h je Skill.',
      ],
    },
    en: {
      title: 'Stats like the in-game panel',
      items: [
        'Live: the “Stats” card shows what the game shows for each action — base and with bonuses: interval, preservation, doubling chance, by-product (firemaking), proficiency and difficulty, tree health, instant cut, weak spot and double damage for woodcutting, rock break and shatter for mining, min/max cast time and fish chance for fishing, perception, stun and loot chances for thieving, plus XP bonuses. Values a bonus improves are green.',
        'Live in combat: combat stats like on the monster page — hit chance, damage, time per kill, kills/h, how often and how hard the monster hits, food/h and XP/h per skill.',
      ],
    },
  },
  {
    version: '0.11.2',
    date: '2026-11-02',
    de: {
      title: 'Intervalle und Boni in der Live-Ansicht',
      items: [
        'Live: „Je Aktion“ zeigt Zeit, XP, Ertrag (und Erfolgschance beim Kochen und Thieving) — als Grundwert, mit Boni und gemessen. Gemessen wird über die XP/h, daraus die Aktionen je Stunde.',
        'Live: „Boni auf diese Aktion“ listet jeden wirkenden Bonus mit Wert und Quelle (Shop-Kauf, Werkzeug, Gilde); was der Planer nicht einrechnet, ist markiert.',
      ],
    },
    en: {
      title: 'Intervals and bonuses in the live view',
      items: [
        'Live: “Per action” shows time, XP, yield (and success chance for cooking and thieving) — base, with bonuses and measured. The measurement goes via XP/h, giving actions per hour.',
        'Live: “Bonuses on this action” lists every bonus that applies, with value and source (shop purchase, tool, guild); what the planner does not count is marked.',
      ],
    },
  },
  {
    version: '0.11.1',
    date: '2026-11-02',
    de: {
      title: 'Uhrzeit, wann das Material leer ist',
      items: [
        'Live: Neben „leer in …“ steht die Uhrzeit, wann das Material aufgebraucht ist — in der Verbrauchsliste, in der Kachel „Material reicht noch“ und in der Seitenleiste. Ist es nicht mehr heute, mit Tag („morgen 00:50“, „Do 22:50“).',
        'Die Kachel „Bis Level“ zeigt ebenso die Uhrzeit des Level-Ups.',
      ],
    },
    en: {
      title: 'Clock time when materials run out',
      items: [
        'Live: next to “empty in …” you see the clock time the materials run out — in the usage list, the “Materials last” tile and the sidebar. Beyond today with the day (“tomorrow 12:50 AM”, “Thu 10:50 PM”).',
        'The “To level” tile shows the clock time of the level-up, too.',
      ],
    },
  },
  {
    version: '0.11.0',
    date: '2026-11-02',
    de: {
      title: 'Live-Ansicht, Verbrauch, Zurücklegen',
      items: [
        'Neue Ansicht „Live“: was gerade läuft, Level-Fortschritt, XP/h und GP/h, Gewinn und Verbrauch je Stunde mit Lagerbestand, wann das Material ausgeht, und die verfolgte Route. Die Karte in der Seitenleiste ist dafür knapp und öffnet die Ansicht.',
        'Alles läuft sekündlich mit: Restzeiten, Level-Fortschritt, Bestände und der Rest des laufenden Schritts werden mit der gemessenen Rate weitergerechnet und beim nächsten Spielstand korrigiert.',
        'Bis die ersten Werte da sind, zeigt die Messung ihren Stand: „misst … 1/3“.',
        'Verfolgte Route: Der laufende Schritt zeigt die gemessene Restzeit mit Fortschrittsbalken, daneben klein die geplante Zeit. Der Kopf sagt, was danach dran ist.',
        'Benachrichtigungen: sobald der laufende Schritt laut Messung fertig ist (nicht erst beim nächsten Spielstand), wenn ein Schritt im selben Block fertig ist (z. B. genug geangelt, jetzt kochen) und wenn das Material ausgeht. Kein Hinweis, wenn du selbst wechselst oder die Route änderst.',
        'Routen zeigen je Schritt, was er verbraucht, und je Abschnitt, was aus dem Lager genommen wird — auch beim Gold-Verdienen.',
        'Zurücklegen: Ein Item mit dem Schloss (oder per Rechtsklick) zurücklegen, dann rühren die Routen den Bestand nicht an und planen einen anderen Weg. Im Routenkopf wieder freigeben.',
      ],
    },
    en: {
      title: 'Live view, consumption, keeping items',
      items: [
        'New “Live” view: what is running, level progress, XP/h and GP/h, items gained and used per hour with bank stock, when materials run out, and the tracked route. The sidebar card is now compact and opens the view.',
        'Everything updates every second: time left, level progress, stock and the rest of the running step are extrapolated with the measured rate and corrected with the next save.',
        'Until the first values are in, the measurement shows its progress: “measuring … 1/3”.',
        'Tracked route: the running step shows the measured time left with a progress bar, the planned time small next to it. The header says what comes next.',
        'Notifications: as soon as the running step is done according to the measurement (not only at the next save), when a step within a block is done (e.g. enough fish, now cook) and when materials run out. No alert when you switch yourself or edit the route.',
        'Routes show what each step uses and, per section, what is taken from your bank — gold routes too.',
        'Keep items: lock an item (or right-click it) and routes leave that stock alone and plan another way. Release it in the route header.',
      ],
    },
  },
  {
    version: '0.10.2',
    date: '2026-11-02',
    de: {
      title: 'Wiki mit Kacheln, ruhigere Ansicht',
      items: [
        'Wiki: Die Startseite zeigt je Art (Items, Monster, Gebiete, Shop, Skills) die Kategorien als Kacheln mit Anzahl. Ein Klick führt hinein, die Brotkrumen zeigen den Weg zurück (Wiki › Items › Waffe). „Alle anzeigen“ listet eine Art nach Kategorien gruppiert.',
        'Die Suche im Wiki geht auf der Startseite über alles, auf einer Unterseite nur über deren Einträge.',
        'Monster-Gebiete zeigen ein echtes Monster statt eines Fragezeichens; die Gebiete stehen in Spielreihenfolge.',
        'Ausrüstung: Die Stufenleiter wird beim Live-Abgleich nicht mehr jedes Mal neu gerechnet und blendet sich nicht mehr kurz aus — nur noch, wenn sich Level, Ausrüstung oder Käufe ändern.',
      ],
    },
    en: {
      title: 'Wiki tiles, calmer view',
      items: [
        'Wiki: the start page shows the categories of each kind (items, monsters, areas, shop, skills) as tiles with counts. A click takes you in, the breadcrumbs lead back (Wiki › Items › Weapon). “Show all” lists a kind grouped by category.',
        'Wiki search covers everything on the start page and only that page’s entries on a sub page.',
        'Monster areas show a real monster instead of a question mark; areas are listed in game order.',
        'Gear: the tier ladder is no longer recalculated on every live sync and no longer fades out briefly — only when levels, gear or purchases change.',
      ],
    },
  },
  {
    version: '0.10.1',
    date: '2026-11-02',
    de: {
      title: 'Ausrüstungs-Stufen, Wiki-Filter',
      items: [
        '„Optimal“ ist jetzt eine Stufenleiter: aus dem Lager, jetzt tragbar, dann je Level-Grenze (bis 10, 20, 30 …) das beste Set — mit Wert, Gewinn gegenüber jetzt, nötigen Leveln und fehlenden Teilen. So siehst du, ob eine Zwischenstufe reicht, bevor du aufs Endset sparst.',
        'Jede Stufe ist mit den Leveln gerechnet, die ihr Set verlangt; ein Klick zeigt das Set mit „Route planen“ und „Übernehmen“.',
        'Optimale Ausrüstung direkt von der Monster-Seite und aus dem Kontextmenü von Monstern.',
        'Wiki: Kategorien als gruppierte Liste links statt einer Wand aus Knöpfen.',
      ],
    },
    en: {
      title: 'Gear tiers, wiki filter',
      items: [
        '“Optimal” is now a tier ladder: from your bank, wearable now, then the best set per level cap (up to 10, 20, 30 …) — with value, gain over now, required levels and missing pieces. See whether an intermediate tier is enough before saving up for the end set.',
        'Each tier is calculated with the levels its set requires; a click shows the set with “Plan route” and “Use this”.',
        'Optimal gear straight from the monster page and the monster context menu.',
        'Wiki: categories as a grouped list on the left instead of a wall of buttons.',
      ],
    },
  },
  {
    version: '0.10.0',
    date: '2026-11-02',
    de: {
      title: 'Bank, Shop, Wiki, Completion — und Ausrüstung A/B',
      items: [
        'Ausrüstung: neuer Reiter „Vergleich A/B“ — zwei beliebige Teile nebeneinander, jeder Wert mit Differenz, dazu die Wirkung im Kampf. Rechtsklick auf Ausrüstung → „Vergleichen (A/B)“.',
        'Ausrüstung: Reiter „Optimal“ — die beste Kombination gegen ein Monster, aus dem Lager, tragbar oder alles; bei fehlenden Teilen das Beste aus dem Lager als Alternative, „Route planen“ je Teil und „Übernehmen“.',
        'Bank mit den Reitern aus dem Spiel, Suche und Verkaufswert; Mengen lassen sich weiter von Hand ändern.',
        'Shop wie im Spiel: Kategorien, Karten mit Kosten, Ertrag oder Bonus, Anforderungen, Kaufstand und „Route planen“.',
        'Wiki: alles mit Detailseite — Items, Monster, Gebiete, Shop, Skills — durchsuchbar, nach Kategorie gefiltert.',
        'Completion: Items gefunden, Monster besiegt, Skill-Level — aus den Statistiken deines Spielstands, Fehlendes ausgegraut.',
        'Das Profil heißt jetzt Einstellungen. Freischaltungen werden mit den Statistiken des Spielstands exakt geprüft statt geschätzt.',
      ],
    },
    en: {
      title: 'Bank, shop, wiki, completion — and gear A/B',
      items: [
        'Gear: new “Compare A/B” tab — any two pieces side by side, every value with its difference, plus the effect in combat. Right-click gear → “Compare (A/B)”.',
        'Gear: “Optimal” tab — the best combination against a monster, from your bank, wearable or everything; for missing pieces the best one from your bank as an alternative, “Plan route” per piece and “Use this”.',
        'Bank with the tabs from the game, search and sell value; amounts can still be edited by hand.',
        'Shop like in the game: categories, cards with cost, yield or bonus, requirements, purchase state and “Plan route”.',
        'Wiki: everything with a detail page — items, monsters, areas, shop, skills — searchable, filtered by category.',
        'Completion: items found, monsters defeated, skill levels — from your save’s statistics, missing ones greyed out.',
        'The profile is now called Settings. Unlocks are checked exactly against the save’s statistics instead of estimated.',
      ],
    },
  },
  {
    version: '0.9.1',
    date: '2026-11-02',
    de: {
      title: 'Ausrüstung frei wählbar',
      items: [
        'Behoben: Mit Live-Verbindung sprang eine selbst gewählte Waffe (oder andere Ausrüstung) sofort auf die aus dem Spiel zurück.',
        'Selbst gewählte Ausrüstung bleibt jetzt stehen, bis du „Ausrüstung aus dem Spiel“ klickst — ein Hinweis zeigt, dass sie gilt (für Kampf, Vergleich und Routen).',
      ],
    },
    en: {
      title: 'Pick any gear',
      items: [
        'Fixed: with the live connection, a weapon (or other gear) you picked jumped right back to the one from the game.',
        'Gear you pick now stays until you click “Gear from the game” — a note shows it is in use (for combat, comparison and routes).',
      ],
    },
  },
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
