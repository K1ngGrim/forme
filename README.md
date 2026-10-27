# Forme

Forme ist ein Präsentationswerkzeug, das komplett im Browser läuft: keine Installation, keine
Konten, kein Server. Es verbindet einen Canvas-Editor im Stil von Figma mit einer Textdatei, in
der jede Folie als Abfolge von Operationen beschrieben ist. Beide Ansichten sind immer
synchron, und die Datei ist die Quelle der Wahrheit.

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
pnpm dev                                              # App starten: http://localhost:5173
pnpm build                                            # statische Seite nach apps/web/dist
pnpm forme render examples/deck.forme --out deck.pdf  # ohne UI rendern
pnpm test                                             # Unit- und Golden-Tests
```

`pnpm build` erzeugt reine HTML/JS/CSS-Dateien. Sie lassen sich auf jedem Webserver hosten
oder lokal mit `pnpm preview` ausliefern.

## GitHub Pages

Die App wird automatisch nach **https://k1nggrim.github.io/forme/** veröffentlicht
(`.github/workflows/pages.yml`). Jeder Push und jeder Pull Request läuft durch Typecheck,
Tests und Build; veröffentlicht wird nur der Standard-Branch. Manuell geht es über
„Actions → Pages → Run workflow“.

Einmalig einrichten: unter „Settings → Pages → Build and deployment“ als Quelle
**GitHub Actions** wählen. Weil die Seite mit relativen Pfaden gebaut wird (`base: './'`),
läuft sie unter jedem Unterpfad, auch in Forks.

## Wo liegen meine Dateien?

- **Browser-Projekte** (Standard, alle Browser): liegen in diesem Browser (IndexedDB) und werden
  automatisch gespeichert. Sichern oder weitergeben über „Datei → Als ZIP herunterladen“,
  wieder öffnen über „ZIP importieren“.
- **Ordner-Projekte** (Chrome, Edge, Opera): „Ordner auf dem Rechner öffnen“ bearbeitet die
  `.forme`-Dateien direkt auf der Platte. Speichern mit Strg+S; Änderungen aus anderen
  Editoren erscheinen sofort in Forme.

Nichts davon verlässt den Rechner.

Die Sprachreferenz steht in [`docs/language.md`](docs/language.md), die Architektur und die
Regeln in [`CLAUDE.md`](CLAUDE.md).

## Templates

| Ordner | Vorlage | Layouts | Komponenten |
| --- | --- | --- | --- |
| `examples/hka-seminar` | Seminar-Präsentation (Inter, Funkturm-Motiv, dreiteilige Fußzeile) | `title`, `content`, `columns`, `statement`, `section`, `closing`, `blank` | `panel`, `tower`, `hka` |
| `examples/hka-projektarbeit` | Projektarbeit (Roboto, Karten, vertikale HKA-Marke, „Teil X von Y“) | `title`, `content`, `columns`, `split`, `section`, `closing`, `blank` | `card`, `ncard`, `callout`, `kpi`, `step`, `hka`, `hka_v` |

Jeder Ordner enthält `theme.forme`, ein Beispiel-Deck `deck.forme` und die Schriften (SIL Open
Font License). In der App stehen sie im Startdialog unter „Neu aus Vorlage“; außerhalb der App
den Ordner kopieren und `deck.forme` bearbeiten. Die HKA-Marke ist als
Vektorpfad nachgebaut (`use @logo hka x=… y=… w=… h=… color=$primary`).

## Aufbau

| Paket | Inhalt |
| --- | --- |
| `packages/core` | Lexer, verlustfreier Parser (CST), Printer, Evaluator mit Provenienz, Szenengraph, Edit-Engine. Reines TypeScript ohne DOM- oder Node-API. |
| `packages/render` | Szenengraph → SVG, Schriftvermessung mit echten Fontdateien |
| `packages/export` | PDF-HTML und PPTX (pptxgenjs), browser-tauglich; `@forme/export/node`: Laden von Platte, ODP (LibreOffice) und CLI |
| `apps/web` | Browser-App: React + Zustand, CodeMirror 6, SVG-Canvas, Projekte in IndexedDB oder Ordnern |

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
- **Projekte** (Strg+O): Vorlagen, zuletzt verwendete Projekte, Ordner öffnen, ZIP importieren.
- **Präsentieren** mit F5. **Export** über die Toolbar: PDF über den Druckdialog des Browsers
  (Strg+P, Ziel „Als PDF speichern“), PPTX als Download. ODP nur über die CLI.
