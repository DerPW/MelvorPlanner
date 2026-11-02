# Melvor Planner

Routen- und Crafting-Planer für **Melvor Idle 2**: Ziel setzen, und der Planer
findet den schnellsten Weg von deinem Stand dorthin — inklusive allem, was
dafür erst freigeschaltet werden muss.

Privates Projekt, nicht mit Games by Malcs oder Jagex verbunden.

## Ziele

- **Items** (Crafting-Plan): alles bis zum Rohstoff heruntergerechnet, abzüglich
  Lager; Ansichten Ablauf · Baum · Material, Quelle je Item im Inspector wählbar.
- **Level**: Skill X auf Level Y.
- **Gold**: Betrag Z verdienen (Herstellen + Verkaufen, Thieving).
- **Freischaltungen**: Shop-Käufe wie die Grain Mill, samt deren Anforderungen.

Jedes Ziel wird zu einer Abfolge von Phasen — trainieren, Gold verdienen,
kaufen, herstellen —, und jede Phase rechnet mit dem Stand, den die vorige
hinterlässt. Steckt ein Skill fest, sucht der Planer die billigste
Freischaltung (z. B. „Farming braucht Samen → Samen gibt es nur per
Thieving 35 → erst Thieving trainieren").

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

Grundwerte ohne Boni (Meisterschaft, Ausrüstung, Tränke …). Die Formeln sind
aus dem Spielcode der Demo 0.11.4 nachgebaut:

| Skill | Zeit je Durchlauf |
|---|---|
| Schmieden, Handwerk, Bogenbau, Runen, Bestienhandwerk | Intervall × Schritte |
| Kräuterkunde | Vorbereiten + Erhitzen + Rühren + Abfüllen |
| Kochen | Intervall; Erfolg = (69 + Level) / (69 + Schwierigkeit), Zutaten gehen auch beim Misserfolg weg |
| Thieving | Intervall + (1 − Erfolg) × 2 s Betäubung; Erfolg = (100 + Level) / (100 + Wahrnehmung) |
| Holzfällen | Intervall × Lebenspunkte des Baums |
| Bergbau | Intervall × erwartete Schläge, (1 − (1 − p)ⁿ) / p |
| Angeln | mittleres Intervall, Fischchance × Gewicht |
| Farming | Wachstum ÷ Felder (Profil), als Wartezeit |

XP-Kurve: `XP(L) = ⌊¼ · Σ_{i=1}^{L−1} ⌊i + 300 · 2^(i/7)⌋⌋` (wie Teil 1, im
Spielcode bestätigt).

Noch nicht drin: Kampf/Stats (braucht einen Kampfsimulator), Monster-Drops,
Hunting, Ranching, Astrology, Boni/Modifikatoren, Import des Spielstands.

## Aufbau

- `scripts/extract-game-data.mjs` — Godot-Paket lesen, Rezepte vereinheitlichen
- `src/core/` — Rechenkern ohne UI: `planner` (Crafting-Baum), `route`
  (Level/Gold-Simulation), `solve` (Ziele → Phasen), `experience`
- `src/ui/` — Oberfläche (React, eigenes CSS im macOS-Stil, Farben aus den
  UI-Texturen des Spiels)
