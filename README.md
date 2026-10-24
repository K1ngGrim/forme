# Forme

Forme ist ein Desktop-Tool für Präsentationen. Es verbindet einen Canvas-Editor im Stil von
Figma mit einer Textdatei, in der jede Folie als Abfolge von Operationen beschrieben ist.
Beide Ansichten sind immer synchron, und die Datei ist die Quelle der Wahrheit.

```
slide @kpis layout=content
  fill @title "Kennzahlen"
  rect @card1 x=$margin y=260 w=520 h=320 radius=24 fill=$surface
  rect @card2 like=@card1
  rect @card3 like=@card1
  distribute h @card1 @card2 @card3 within=content
  text @kpi1 "1,2 Mio €" style=h1 in=@card1 pad=$space.l
```

## Schnellstart

```
pnpm install
pnpm dev                                              # App starten
pnpm forme render examples/deck.forme --out deck.pdf  # ohne UI rendern
pnpm test                                             # Unit- und Golden-Tests
```

Die Sprachreferenz steht in [`docs/language.md`](docs/language.md), die Architektur und die
Regeln in [`CLAUDE.md`](CLAUDE.md).

## Templates

| Ordner | Vorlage | Layouts | Komponenten |
| --- | --- | --- | --- |
| `examples/hka-seminar` | Seminar-Präsentation (Inter, Funkturm-Motiv, dreiteilige Fußzeile) | `title`, `content`, `columns`, `statement`, `section`, `closing`, `blank` | `panel`, `tower`, `hka` |
| `examples/hka-projektarbeit` | Projektarbeit (Roboto, Karten, vertikale HKA-Marke, „Teil X von Y“) | `title`, `content`, `columns`, `split`, `section`, `closing`, `blank` | `card`, `ncard`, `callout`, `kpi`, `step`, `hka`, `hka_v` |

Jeder Ordner enthält `theme.forme`, ein Beispiel-Deck `deck.forme` und die Schriften (SIL Open
Font License). Für eine neue Präsentation den Ordner kopieren und `deck.forme` bearbeiten
oder in einem eigenen Deck `theme "./pfad/zu/theme.forme"` angeben. Die HKA-Marke ist als
Vektorpfad nachgebaut (`use @logo hka x=… y=… w=… h=… color=$primary`).

## Aufbau

| Paket | Inhalt |
| --- | --- |
| `packages/core` | Lexer, verlustfreier Parser (CST), Printer, Evaluator mit Provenienz, Szenengraph, Edit-Engine. Reines TypeScript ohne DOM- oder Node-API. |
| `packages/render` | Szenengraph → SVG, Schriftvermessung mit echten Fontdateien |
| `packages/export` | PDF, PPTX (pptxgenjs), ODP (LibreOffice), Lader und CLI |
| `apps/desktop` | Electron-App: React + Zustand, CodeMirror 6, SVG-Canvas |

## Bedienung (Auswahl)

- **Canvas:** Klicken wählt aus (Umschalt fügt hinzu), Ziehen verschiebt mit Einrasten (Strg
  hält das Einrasten an), Griffe skalieren (Umschalt hält das Seitenverhältnis), der orange
  Punkt rundet Ecken, Doppelklick bearbeitet Text, Pfeiltasten schieben um 1 px (Umschalt:
  10 px).
- **Werkzeuge:** V Auswahl, R Rechteck, O Ellipse, L Linie, A Pfeil, T Text, I Bild.
- **Toolbar:** Ausrichten, Verteilen und Stapeln hängen semantische Ops an. Mit Alt-Klick
  werden die berechneten Werte direkt geschrieben.
- **Code:** Cursor in einer Operation wählt deren Objekte aus, Strg+Leertaste vervollständigt.
- **Kommandozeile** (Strg+K): Ops tippen, sie werden an die aktuelle Folie angehängt.
- **Undo/Redo** (Strg+Z / Strg+Umschalt+Z) teilen sich einen Stack für Code und Canvas.
- **Theme-Modus** (Strg+Umschalt+T): Code zeigt die Theme-Datei, Gesten ändern das Theme.
- **Präsentieren** mit F5, Export über das Menü oder die Toolbar (PDF, PPTX, ODP).
