# Melvor Planner

Routen- und Crafting-Planer für **Melvor Idle 2**: Ziel setzen, und der Planer
findet den schnellsten Weg von deinem Stand dorthin — inklusive allem, was
dafür erst freigeschaltet werden muss.

Privates Projekt, nicht mit Games by Malcs oder Jagex verbunden.

## Routen

Jedes Ziel ist eine **Route** in der Seitenleiste — der Weg dorthin samt
allem, was vorher nötig ist. Die Übersicht („Routen") legt neue an und
schlägt vor, was mit dem jetzigen Stand gleich zu bauen ist.

- **Items**: alles bis zum Rohstoff heruntergerechnet, abzüglich Lager;
  Ansichten Ablauf · Baum · Material, Quelle je Item im Inspector wählbar.
  (Bis 0.5 gab es dafür einen gemeinsamen Crafting-Plan; gespeicherte Items
  werden beim Start zu je einer Item-Route.)
- **Level**: Skill X auf Level Y.
- **Gold**: Betrag Z verdienen (Herstellen + Verkaufen, Thieving).
- **Freischaltungen**: Shop-Käufe wie die Grain Mill, samt deren Anforderungen.

**Freischaltungen**: Skills, Kampf, Shop und Bank sind im Spiel gesperrt, bis
die Bedingungen ihres Navigationseintrags erfüllt sind (Level, aber auch
Lebenszeit-Statistiken wie „20 Raw Shrimp geangelt" oder „250 GP durch
Verkäufe"). Der Extraktor hängt die Freischaltung als Anforderung `unlock` an
jedes Rezept des Skills, jeden Shop-Kauf und jedes Bank-Rezept; der Planer
löst sie wie einen Kauf auf. Statistiken stehen nicht im Spielstand — ob ein
Skill frei ist, wird geschätzt (schon trainiert, Käufe getätigt, Level-
Bedingungen erfüllt) und lässt sich im Profil von Hand festlegen.

Jedes Ziel wird zu einer Abfolge von Phasen — trainieren, Gold verdienen,
kaufen, herstellen —, und jede Phase rechnet mit dem Stand, den die vorige
hinterlässt. Steckt ein Skill fest, sucht der Planer die billigste
Freischaltung (z. B. „Farming braucht Samen → Samen gibt es nur per
Thieving 35 → erst Thieving trainieren").

## Oberfläche

- **Globale Suche (⌘K)** oben in der Seitenleiste: Items, Skills, Monster,
  Gebiete/Dungeons, Shop-Käufe, Rezepte — und Ansichten und Aktionen
  (Routen anlegen, Import, Sprache, Optionen). Neue Sorten kommen als
  Eintrag in `KINDS` (`src/ui/search.tsx`) dazu.
- **Detailseiten** für Items, Monster, Gebiete und Shop-Käufe mit allem, was
  die Spieldaten hergeben; alles verlinkt, mit Zurück.
- **Tooltip und Kontextmenü** für jedes Element mit `data-entity="typ:id"`
  (`src/ui/EntityHover.tsx`) — Items, Skills, Monster, Gebiete, Shop-Käufe.
  Icons tragen es über `GameIcon entity=…`, Texte über `<Ref>`; „braucht X",
  Quellen (`SourceText`, bei Shop-Käufen mit Kategorie) und die Begründungen
  im Ablauf (`WhyTag`, Verweis über `params.ref` der Meldung) sind klickbar.
- **Brotkrumen** (`src/ui/Breadcrumbs.tsx`): Folgt man Verweisen, wächst
  oben der Pfad; Seitenleiste und Suche (`root: true`) beginnen einen neuen.
- **Deutsch/Englisch** nach Browser, umstellbar (`src/i18n/`; `pnpm check:i18n`
  prüft, dass jeder Schlüssel in beiden Sprachen steht).
- Versionsanzeige mit Release Notes (`src/releaseNotes.ts`).

## Spielstand importieren

Profil → „Spielstand importieren": `.sav`-Datei hineinziehen oder den
Export-Text aus dem Spiel einfügen. Übernommen werden Level und genaue XP,
Bank, Gold, Shop-Käufe und ausgerüstete Werkzeuge, dazu die Level-Grenze der
Version (Demo: 60). Die Dateien liegen unter
`~/Library/Application Support/Games By Malcs/Melvor Idle 2/steam/<Steam-ID>/saves/`.

Format (aus dem Spielcode): Brotli( Version · Kopf · Einheiten → Komponenten ),
Einheiten und Komponenten in Blöcken mit Längenangabe — gelesen wird nur, was
der Planer braucht, der Rest wird übersprungen. Das Spiel schließt den
Brotli-Strom nie ab; deshalb `brotli-dec-wasm` als Strom-Decoder, der alles
bis dahin liefert. Geprüft mit SaveVersion 28 (Demo 0.11.4).

### Live mitlesen

Profil → „Live-Verbindung": Spielstand wählen und einschalten. Der lokale
Server (`scripts/vite-save-plugin.ts`) findet die Spielstände selbst und
liefert sie unter `/api/saves`; die App fragt alle 4 s nach der Speicherzeit
und liest bei einer Änderung neu ein — in jedem Browser, solange der Planer
mit `pnpm dev` (oder `pnpm preview`) läuft. Gilden-Rang und Farming-Felder
bleiben dabei, wie sie eingestellt sind.

## Boni

Shop-Käufe (gekauft), Werkzeuge im Werkzeuggürtel (ausgerüstet) und
Gilden-Boni (Rang im Profil einstellen) gehen in alle Zeiten, Mengen und
Raten ein — abschaltbar im Profil. Jedes Rezept wird dafür aus seinen
Grundwerten neu berechnet, mit den Formeln aus den `…ActionStats` des Spiels;
ohne Boni ergibt das exakt die Grundwerte. Boni werden addiert, globale
Gruppen (`GlobalPercentActionInterval`, `GlobalPercentXpGained`) fließen in
jeden Skill ein. Noch nicht dabei: Tränke, Astrologie, Haustiere, angelegte
Ausrüstung; Werte, die der Planer nicht modelliert (Vogelnester u. Ä.), sind in
der Skill-Ansicht als „nicht gerechnet" markiert.

## Loslegen

```bash
pnpm install
pnpm extract   # liest Daten + Icons aus der installierten Demo/Vollversion
pnpm dev       # http://localhost:5178
```

`pnpm extract` sucht `Melvor2.pck` in der Steam-Bibliothek (Vollversion vor
Demo). Sonst den Pfad übergeben: `pnpm extract -- /pfad/zu/Melvor2.pck`.
Die Ausgabe landet in `public/game/` und ist **nicht** im Repo — die Daten
gehören den Entwicklern.

### Zum Release (Early Access 17.11.2026)

Spiel installieren, `pnpm extract` erneut laufen lassen, fertig. Das Skript
liest alle Datenpakete generisch, sucht die Vollversion vor der Demo und
meldet am Ende Objekttypen, die Items erzeugen, aber noch nicht gerechnet
werden (in der Demo: Ranching, Hunting, Astrology).

## Wie gerechnet wird

**Routen** sind eine gierige Simulation: In jedem Abschnitt gewinnt die
Aktivität mit der besten Rate (Ziel-XP bzw. Gold pro Stunde) unter dem, was
gerade freigeschaltet ist. Ein Abschnitt endet beim Ziel oder bei einem
Level-Up irgendeines beteiligten Skills — dann kann etwas Besseres frei sein.
Material wird wahlweise über dieselbe Quellenwahl selbst beschafft; dessen
Zeit und XP zählen mit. Level-Routen behalten die Produkte (→ Lager),
Gold-Routen verkaufen sie. Gold, das man nicht hat, wird nicht ausgegeben.

Grundwerte (Boni siehe oben). Die Formeln sind aus dem Spielcode der Demo
0.11.4 nachgebaut:

| Skill | Zeit je Durchlauf |
|---|---|
| Schmieden, Handwerk, Bogenbau, Runen, Bestienhandwerk | Intervall × Schritte |
| Kräuterkunde | Vorbereiten + Erhitzen + Rühren + 10 × Abfüllen |
| Kochen | Intervall; Erfolg = (69 + Level) / (69 + Schwierigkeit), Zutaten gehen auch beim Misserfolg weg |
| Thieving | Intervall + (1 − Erfolg) × 2 s Betäubung; Erfolg = (100 + Level) / (100 + Wahrnehmung) |
| Holzfällen | Intervall × Lebenspunkte des Baums |
| Bergbau | Intervall × erwartete Schläge, (1 − (1 − p)ⁿ) / p |
| Angeln | mittleres Intervall, Fischchance × Gewicht |
| Farming | Wachstum ÷ Felder (Profil), als Wartezeit; Ertrag minus Krankheit/Schädlinge über dem Schutz |

XP-Kurve: `XP(L) = ⌊¼ · Σ_{i=1}^{L−1} ⌊i + 300 · 2^(i/7)⌋⌋` (wie Teil 1, im
Spielcode bestätigt).

Noch nicht drin: Kampf/Stats (braucht einen Kampfsimulator), Monster-Drops,
Hunting, Ranching, Astrology; Gilden-Rang aus dem Spielstand lesen.

## Aufbau

- `scripts/extract-game-data.mjs` — Godot-Paket lesen, Rezepte vereinheitlichen
- `scripts/vite-save-plugin.ts` — Spielstände für die Live-Verbindung
- `src/core/` — Rechenkern ohne UI: `planner` (Crafting-Baum), `route`
  (Level/Gold-Simulation), `solve` (Ziele → Phasen), `bonuses` (Boni →
  Rezepte neu berechnen), `experience`, `save` (Spielstand lesen),
  `saveImport` (Datei/Text → Profil)
- `src/ui/` — Oberfläche (React, eigenes CSS im macOS-Stil, Farben aus den
  UI-Texturen des Spiels)
