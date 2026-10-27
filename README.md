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
pnpm forme compile examples/deck.forme                # ohne UI rendern (deck.pdf)
pnpm test                                             # Unit- und Golden-Tests
```

`pnpm build` erzeugt reine HTML/JS/CSS-Dateien. Sie lassen sich auf jedem Webserver hosten
oder lokal mit `pnpm preview` ausliefern.

## Dokumentation

**https://k1nggrim.github.io/forme/docs/** – aufgebaut wie die Typst-Dokumentation: Einstieg,
Anleitung, Referenz und Werkzeuge, Suche mit `Strg+K`, und jedes Forme-Beispiel wird mit dem
echten Compiler gerendert und lässt sich direkt auf der Seite bearbeiten. Quelle sind die
Markdown-Dateien in `docs/`; lokal mit `pnpm docs` (http://localhost:4174).

## GitHub Pages

Die App wird automatisch nach **https://k1nggrim.github.io/forme/** veröffentlicht, die
Dokumentation nach `/forme/docs/` (`.github/workflows/pages.yml`). Jeder Push und jeder Pull Request läuft durch Typecheck,
Tests und Build; veröffentlicht wird nur der Standard-Branch. Manuell geht es über
„Actions → Pages → Run workflow“.

Einmalig einrichten: unter „Settings → Pages → Build and deployment“ als Quelle
**GitHub Actions** wählen. Weil die Seite mit relativen Pfaden gebaut wird (`base: './'`),
läuft sie unter jedem Unterpfad, auch in Forks.

## Kommandozeile

Wie bei Typst lässt sich eine Präsentation komplett ohne Oberfläche bauen:

```
forme init vortrag -t hka-seminar   # Projekt aus Vorlage (forme templates listet alle)
forme watch vortrag/deck.forme      # PDF bei jeder Änderung neu erzeugen
forme compile vortrag/deck.forme vortrag.pptx
forme check vortrag/deck.forme      # Fehler mit Quelltext-Ausschnitt, --json für Werkzeuge
```

Im Repository heißt der Aufruf `pnpm forme …`. Als eigenständiges Programm:
`pnpm --filter @forme/cli bundle` erzeugt `packages/cli/dist` (eine Datei plus Vorlagen), danach
`npm install -g ./packages/cli/dist`. Für PDF braucht die CLI einen Chromium-Browser; sie
findet ein installiertes Chrome oder Edge selbst.

## VS Code

Die Erweiterung in `apps/vscode` bringt Forme in den Editor, einschließlich des kompletten
Forme-Editors mit Canvas als eigenem Tab („Forme: Im Forme-Editor öffnen“), der mit dem
Texteditor synchron bleibt. Dazu: Hervorhebung, Fehler beim Tippen
(auch im Theme), Autovervollständigung, Gliederung, Gehe zu Definition (bis ins Theme),
Umbenennen von IDs, Farbwähler und eine Live-Vorschau (`Strg+K V`). In der Vorschau lassen sich
Objekte verschieben, skalieren, löschen und Texte bearbeiten; das ändert die Datei mit minimalen
Text-Edits, Undo wie gewohnt mit `Strg+Z`. Export nach PDF, PPTX, HTML, SVG und ODP.

Installieren: `pnpm --filter forme-vscode package` erzeugt `apps/vscode/forme.vsix`, dann in VS
Code „Erweiterungen → … → Aus VSIX installieren“ (oder `code --install-extension forme.vsix`).
Jeder CI-Lauf hängt die fertige `forme.vsix` und die gebündelte CLI als Artefakte an.

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
| `packages/export` | PDF-HTML und PPTX (pptxgenjs), browser-tauglich; `@forme/export/node`: Laden von Platte, Ausgabedateien, ODP (LibreOffice) |
| `packages/cli` | Kommandozeile `forme`: compile, watch, check, init |
| `apps/web` | Browser-App: React + Zustand, CodeMirror 6, SVG-Canvas, Projekte in IndexedDB oder Ordnern |
| `apps/vscode` | VS Code-Erweiterung: Sprache, Diagnosen, Live-Vorschau mit direkter Manipulation, Export |
| `apps/docs` | Dokumentations-Website aus `docs/*.md`, mit live gerenderten Beispielen und Suche |

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
