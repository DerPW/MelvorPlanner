# Melvor Planner

Crafting-Planer für **Melvor Idle 2**: Ziel-Items wählen, und der Planer
rechnet alles bis zum letzten Rohstoff herunter — Materialien, Gold, Zeit,
XP und fehlende Level, abzüglich dessen, was schon im Lager liegt.

Privates Projekt, nicht mit Games by Malcs oder Jagex verbunden.

## Loslegen

```bash
pnpm install
pnpm extract   # liest Daten + Icons aus der installierten Demo/Vollversion
pnpm dev       # http://localhost:5178
```

`pnpm extract` sucht `Melvor2.pck` in der Steam-Bibliothek (Vollversion vor
Demo). Sonst den Pfad übergeben: `pnpm extract -- /pfad/zu/Melvor2.pck`.
Die Ausgabe landet in `public/game/` und ist **nicht** im Repo — die Daten
gehören den Entwicklern. Nach jedem Spiel-Update neu extrahieren.

## Was gerechnet wird

Grundwerte ohne Boni (Meisterschaft, Ausrüstung, Tränke …). Die Formeln sind
aus dem Spielcode der Demo 0.11.4 nachgebaut:

| Skill | Zeit je Durchlauf |
|---|---|
| Schmieden, Handwerk, Bogenbau, Runen, Bestienhandwerk | Intervall × Schritte |
| Kochen | Intervall; Erfolg = (69 + Level) / (69 + Schwierigkeit), Zutaten gehen auch beim Misserfolg weg |
| Holzfällen | Intervall × Lebenspunkte des Baums |
| Bergbau | Intervall × erwartete Schläge, (1 − (1 − p)ⁿ) / p |
| Angeln | mittleres Intervall, Fischchance × Gewicht |
| Farming | Wachstum als Wartezeit, nicht als aktive Zeit |

XP-Kurve: `XP(L) = ⌊¼ · Σ_{i=1}^{L−1} ⌊i + 300 · 2^(i/7)⌋⌋` (wie Teil 1).

Noch nicht als Quelle modelliert: Monster-Drops, Thieving, Hunting, Ranching.

## Aufbau

- `scripts/extract-game-data.mjs` — Godot-Paket lesen, Rezepte vereinheitlichen
- `src/core/` — Rechenkern ohne UI (Plan, XP, Formatierung)
- `src/ui/` — Oberfläche
