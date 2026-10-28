# CLAUDE.md – Forme

Forme ist ein Werkzeug zum Erstellen von Präsentationen, das vollständig im Browser läuft
(keine Installation, keine Konten, kein Server). Es verbindet einen Figma-artigen
Canvas-Editor mit einer textuellen Darstellung, in der jede Folie als Abfolge von Operationen
beschrieben ist (ähnlich einem CAD-Befehlsprotokoll). Beide Ansichten sind **immer synchron**:
Eine Änderung im Editor ändert die Datei, eine Änderung in der Datei ändert den Editor.

---

## Grundprinzipien (nicht verhandelbar)

1. **Die Datei ist die Quelle der Wahrheit.** Der Szenengraph wird ausschließlich durch
   Auswerten der Datei erzeugt. Der Editor verändert niemals den Szenengraphen direkt,
   sondern erzeugt Textänderungen an der Datei. Danach wird neu ausgewertet.
2. **Alles, was der Editor kann, muss in der Datei ausdrückbar sein.** Kein Feature
   ohne zugehörige Operation in der Sprache.
3. **Sequentielle Semantik.** Operationen einer Folie werden von oben nach unten ausgeführt.
   Eine Operation sieht nur den Zustand, den die vorherigen erzeugt haben. Referenzen auf
   später definierte Objekte sind ein Fehler. Dadurch sind Zyklen ausgeschlossen.
4. **Stabile IDs.** Jedes Objekt hat eine ID (`@name`), die in der Datei steht. Referenzen
   laufen immer über IDs, nie über Positionen in der Liste.
5. **Verlustfreies Round-Trip.** Der Parser erzeugt einen verlustfreien Syntaxbaum
   (inkl. Kommentare, Leerzeilen, Formatierung). Editor-Änderungen erzeugen minimale
   Text-Diffs. Die Datei wird nie komplett neu formatiert.
6. **Templates sind nur Dateien.** Ein Theme ist eine Forme-Datei mit `theme`-Kopf, die
   Tokens, Farben, Schriften, Styles, Master und Layouts definiert. Keine Sonderlogik
   außerhalb der Sprache.

## Nicht-Ziele

Animationen, Übergänge, Echtzeit-Kollaboration, Cloud-Sync, Video-Einbettung, Plugins,
Benutzerkonten/Anmeldung, Server-Backend. Alle Daten bleiben im Browser bzw. auf dem Rechner.
Diese Features nicht vorschlagen oder vorbereiten, solange nicht ausdrücklich gewünscht.

---

## Tech-Stack

- **Browser-App** (statische Seite, gebaut mit **Vite**), **TypeScript strict**, **pnpm** Workspaces
- **React** + **Zustand** für die UI
- **SVG** als Renderer (Folien sind klein, kein WebGL nötig)
- Dateien: **IndexedDB** für Browser-Projekte (alle Browser), **File System Access API** für
  echte Ordner auf dem Rechner (Chrome/Edge/Opera). Kein Server, keine Konten.
- **CodeMirror 6** für die Code-Ansicht (eigene Sprache, Highlighting, Fehler, Autocomplete)
- Parser: **handgeschrieben, rekursiver Abstieg** (Fehlertoleranz, verlustfreier CST)
- Export: Druckdialog des Browsers (PDF), **pptxgenjs** (PPTX); ODP nur über die CLI
  (LibreOffice headless)
- Tests: **Vitest** (Unit/Golden), **Playwright** mit Chromium gegen den Vite-Build (E2E)

## Projektstruktur

```
packages/
  core/      Lexer, Parser (CST), AST, Printer, Evaluator, Szenengraph, Edit-Engine
             → reines TypeScript, KEIN DOM, KEIN Node-API. Muss isoliert testbar sein.
  render/    Szenengraph → SVG
  export/    PDF, PPTX (browser-tauglich); `@forme/export/node`: Laden von Platte, Ausgabe-
             dateien, headless Chromium, ODP
  cli/       Kommandozeile `forme` (compile, watch, check, init), bündelbar zu einer Datei
apps/
  web/       Browser-App: Editor-UI, Projekte (IndexedDB/Ordner), Export im Browser
  vscode/    VS Code-Erweiterung: Sprache, Diagnosen, Vorschau mit direkter Manipulation, Export
  docs/      Dokumentations-Website (statisch, aus docs/*.md erzeugt, Beispiele live gerendert)
docs/
  language.md   Sprachreferenz: Syntax, Werte, Dateiarten, Rückschreibe-Regeln (verbindlich)
  reference/    eine Seite pro Operation mit Parametern und Beispielen (verbindlich),
                _parameter.md: gemeinsame Parameter, <kategorie>.md: Kategorieseiten
  guide.md      Anleitung; index.md, install.md, tools.md: Startseite, Installation, Werkzeuge
examples/       Beispiel-Decks und -Themes (dienen auch als Golden-Tests)
```

## Befehle

```
pnpm install      Abhängigkeiten installieren
pnpm dev          App im Browser starten (Vite-Dev-Server, http://localhost:5173)
pnpm build        Statische Seite bauen (apps/web/dist, auf jedem Webserver hostbar)
pnpm preview      Gebaute Seite lokal ausliefern
pnpm test         alle Vitest-Tests (core, render, export, web)
pnpm test:e2e     Playwright E2E (Chromium) gegen den Build
pnpm typecheck    tsc für alle Pakete
pnpm forme compile <deck.forme> [out]  CLI: rendern ohne UI (.pdf/.pptx/.odp/.html/.svg)
pnpm forme watch <deck.forme> [out]    CLI: bei jeder Änderung neu rendern
pnpm forme check <deck.forme> [--json] CLI: nur Diagnosen ausgeben
pnpm forme init [ordner] -t <vorlage>  CLI: Projekt aus einer Vorlage anlegen
pnpm --filter @forme/cli bundle        CLI als eine Datei nach packages/cli/dist (npm-Paket @k1nggrim/forme)
pnpm --filter forme-vscode package     VS Code-Erweiterung als apps/vscode/forme.vsix
pnpm docs                              Dokumentation lokal (http://localhost:4174, baut bei Änderungen neu)
pnpm build:docs                        Dokumentation nach apps/docs/dist
```

Hinweise:
- Die CLI druckt PDFs mit headless Chromium (playwright-core): `--chromium`/`FORME_CHROMIUM`,
  sonst Playwrights Chromium, sonst installiertes Chrome oder Edge. ODP gibt es nur
  über die CLI, weil LibreOffice nicht im Browser läuft.
- Golden-Snapshots der Beispiele liegen in `examples/__golden__/`. Aktualisieren mit
  `pnpm test -u`, danach den Diff prüfen.
- Pakete werden nicht vorgebaut: `core`, `render` und `export` werden als TypeScript-Quellen
  importiert (Vite bündelt sie, die CLI läuft über tsx). `core`, `render` und `@forme/export`
  dürfen keine Node-APIs verwenden; Node-Code gehört nach `@forme/export/node`.
- Die Vorlagen im Startdialog sind die Ordner unter `examples/` (zur Build-Zeit eingebunden).
- VS Code: Die Erweiterung nutzt `core`, `render` und `@forme/export/node` direkt (kein
  Sprachserver). Der Forme-Editor in VS Code ist die unveränderte Web-App (`apps/web`, beim
  Bauen nach `apps/vscode/dist/editor`), die zur Laufzeit erkennt, dass sie in einem Webview
  läuft (`platform/host.ts`): Dateien kommen über die Erweiterung, jede Änderung geht als
  Text-Edit zurück (`CustomTextEditorProvider`, `apps/vscode/src/editor.ts`). Vorschau-Gesten laufen über dieselben Intents und `computeEdit` wie die Web-App
  und werden als `WorkspaceEdit` angewendet (VS Codes Undo-Stack). Tests laufen mit einer
  nachgebauten `vscode`-API (`apps/vscode/test/mock-vscode.ts`), das Webview-Skript in Chromium.
- Dokumentation: Die Seiten sind Abschnitte aus `docs/*.md`; welche Überschrift zu welcher Seite
  wird, steht in `apps/docs/src/site.ts` (beim Umbenennen von Überschriften mitziehen, der Test
  schlägt sonst fehl). Die Referenz der Operationen ist wie bei Typst aufgebaut: eine Datei pro
  Op unter `docs/reference/<kategorie>/`, Format in `apps/docs/src/reference.ts` (Frontmatter
  `summary`, `## Parameter` mit `### schlüssel` und `- Typ:`/`- Standard:`, gemeinsame
  Parameter per `<!-- gemeinsam: … -->`). Beispiele mit einer Zeile `---` zeigen oben
  Theme-Code (ergänzt das Standard-Theme) und unten die Folie. Forme-Codeblöcke werden mit dem echten Compiler gerendert und lassen sich
  im Browser bearbeiten; Theme-Ausschnitte und Fragmente bleiben reiner Code. Ein Beispiel, das
  absichtlich einen Fehler zeigt, bekommt einen Kommentar `// FEHLER`.
- Releases: `.github/workflows/release.yml` (Actions → Release → Run workflow mit Version, oder
  Tag `v*`): GitHub-Release mit `forme-cli.tgz` und `forme.vsix`, npm-Paket `@k1nggrim/forme`
  falls das Secret `NPM_TOKEN` gesetzt ist. `forme-cli` auf npm gehört nicht zu Forme.
- GitHub Pages: `.github/workflows/pages.yml` prüft jeden Push/PR (Typecheck, Tests, Build) und
  veröffentlicht `apps/web/dist` vom Standard-Branch, die Dokumentation darin unter `docs/`. `base: './'` in `vite.config.ts` beibehalten,
  damit die Seite unter `/<repo>/` funktioniert.

---

## Die Sprache (Kurzüberblick – Details in docs/language.md)

Zeilenbasiert, eine Operation pro Zeile, Blöcke per Einrückung (2 Leerzeichen).

```
<verb> [@id] [Positionsargumente] [key=value ...]   // Kommentar
```

- IDs: `@title`, Referenzen auf Eigenschaften: `@box.x`, `@box.right`, `@box.center`
- Tokens aus dem Theme: `$primary`, `$space.l`
- Farben: `#1E40AF`, `rgba(...)`
- Einheiten: px im Folienkoordinatensystem (Standard 1920×1080), `%` relativ zur Folie
- Ausdrücke ohne Leerzeichen direkt, sonst in Klammern: `w=(slide.w - 2*$margin)`
- Strings mit Interpolation: `"Folie {slide.n} von {deck.total}"`

### Theme-Datei (`themes/corporate.forme`)

```
theme "Corporate"
size 1920x1080

token margin 120
token space.l 32
color primary #1E40AF
color surface #F3F4F6
color muted #6B7280
font heading "Inter" weight=700 file="./fonts/Inter-Bold.ttf"
font body "Inter" weight=400 file="./fonts/Inter-Regular.ttf"

style h1 font=heading size=64 color=$primary
style body font=body size=28 line=1.4
style footer font=body size=18 color=$muted

master default
  background fill=#FFFFFF
  text @pagenum "{slide.n}" style=footer x=(slide.w-$margin) y=(slide.h-60) anchor=right

layout title master=default
  background fill=$primary
  hide @pagenum
  slot @title style=h1 color=#FFFFFF x=$margin y=380 w=(slide.w-2*$margin)
  slot @subtitle style=body color=#FFFFFF x=$margin y=@title.bottom+24

layout content master=default
  slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin)
  region content x=$margin y=240 w=(slide.w-2*$margin) h=(slide.h-360)
```

### Deck-Datei (`deck.forme`)

```
deck "Quartalsbericht Q3"
theme "./themes/corporate.forme"

slide @intro layout=title
  fill @title "Quartalsbericht Q3"
  fill @subtitle "Vertrieb & Marketing"

slide @kpis layout=content
  fill @title "Kennzahlen"
  rect @card1 x=$margin y=260 w=520 h=320 radius=24 fill=$surface
  rect @card2 like=@card1
  rect @card3 like=@card1
  distribute h @card1 @card2 @card3 within=content
  align top @card1 @card2 @card3
  text @kpi1 "1,2 Mio €" style=h1 in=@card1 pad=$space.l
  image @chart "./img/umsatz.png" x=$margin y=620 w=800 fit=contain radius=12
  number figure @chart caption="Abb. {figure}: Umsatz nach Region"
  notes "Wachstum im Süden betonen."
```

### Auswertungsreihenfolge pro Folie

Theme-Globals → Master-Ops → Layout-Ops → Folien-Ops. Folien-Ops dürfen Objekte aus
Master/Layout per `set @id ...` überschreiben oder per `hide @id` ausblenden.

### Operationsgruppen

- **Erzeugen:** `rect`, `ellipse`, `line`/`arrow`, `polygon`, `path`, `text`, `list`,
  `image`, `table`, `group`, `slot` (im Layout), `fill` (Slot befüllen), `use` (Komponente)
- **Verändern:** `set`, `move`, `resize`, `round` (Ecken, einzeln oder gesamt), `style`,
  `stroke`, `shadow`, `opacity`, `hide`, `z` (Ebenenreihenfolge)
- **Anordnen:** `align`, `distribute`, `stack` (Auto-Layout), `grid`; Layout-Container
  `row`/`column` (verschachtelbar, wie Bootstrap-Zeilen/-Spalten)
- **Nummerierung:** `counter`, `number`, Interpolation `{slide.n}`, `{deck.total}`,
  `{section}`, `{figure}`, eigene Zähler; `section "Name"` auf Folienebene
- **Definitionen (nur Theme):** `token`, `color`, `font`, `style`, `master`, `layout`,
  `region`, `component`
- **Sonstiges:** `notes` (Sprechernotizen, werden nach PPTX exportiert)

Text unterstützt Rich-Text-Runs (fett, kursiv, Farbe, Links) und Listen mit Ebenen.

---

## Synchronisation Editor ⇄ Datei

Ein zentraler Store hält pro Datei: Quelltext, CST, Auswertungsergebnis, Fehlerliste.

**Projekte** sind Ordner aus Forme-Dateien und Assets (Bilder, Schriften), Pfade relativ zum
Projekt. Browser-Projekte (IndexedDB) werden automatisch gespeichert; Ordner-Projekte
schreiben bei Strg+S auf die Platte, und Änderungen anderer Programme an Deck oder Theme
werden erkannt und wie eine Textänderung übernommen (eigener Undo-Schritt).

**Datei → Editor:** Textänderung → inkrementell neu parsen → betroffene Folie(n) neu
auswerten (Theme-Änderung ⇒ alle) → SVG aktualisieren.

**Editor → Datei:** Geste → *Intent* (z. B. `MoveIntent{id, dx, dy}`) → `core/edit`
berechnet minimale Text-Edits → anwenden → normaler Pfad wie oben.

- Während eines Drags nur transiente Vorschau, **Commit beim Loslassen** (= ein Undo-Schritt).
- **Ein gemeinsamer Undo-Stack** auf Text-Edit-Ebene für beide Ansichten.
  CodeMirrors eigene History ist deaktiviert.
- **Selektion ist synchron:** Klick auf Objekt markiert dessen Operationen im Code;
  Cursor in einer Operation markiert das Objekt im Canvas.
- **Bei Parse-Fehlern** bleibt der letzte gültige Stand der Folie sichtbar, wird als
  veraltet markiert und ist im Canvas nicht editierbar, bis der Fehler behoben ist.

### Provenienz

Der Evaluator speichert für jede Eigenschaft jedes Objekts, **welche Operation (Quellbereich)
sie zuletzt geschrieben hat** und ob der Wert ein Literal oder ein Ausdruck war. Darauf
basieren alle Rückschreibe-Regeln.

### Rückschreibe-Regeln

1. Letzter Schreiber ist eine Op **auf der aktuellen Folie** und der Wert ist ein
   **Literal** → Literal ersetzen.
2. Wert ist ein **Ausdruck**, stammt aus **Master/Layout/Theme** oder aus einer
   **semantischen Op** (`align`, `distribute`, `stack` …) → eine `set @id prop=wert`-Zeile
   direkt nach dem letzten Schreiber in der Folie einfügen bzw. eine bereits dort
   stehende `set`-Zeile für dieses Objekt aktualisieren. Im UI wird die Überschreibung
   sichtbar markiert.
3. Canvas-Gesten auf einer Folie ändern **niemals** die Theme-Datei. Das geht nur im
   Theme-Bearbeitungsmodus.
4. **Neue Objekte** aus dem Editor → Erzeugungs-Op am Ende des Folienblocks anhängen,
   mit automatisch vergebener ID (`@rect3`). Umbenennen einer ID benennt alle Referenzen mit um.
5. **Toolbar-Befehle** (Ausrichten, Verteilen, Nummerieren) hängen semantische Ops an.
   Mit Alt-Taste werden stattdessen die berechneten Literale geschrieben („backen“).
6. **Löschen** → Erzeugungs-Op entfernen, ID aus Mehrfachziel-Ops streichen, Ops mit nur
   diesem Ziel entfernen. Gibt es Ausdrücke, die das Objekt referenzieren, vorher warnen.
7. Die **Kommandozeile** (CAD-artig, unten im Fenster) fügt getippte Ops am Ende der
   aktuellen Folie ein. Autocomplete für Verben, IDs, Tokens und Keys.

---

## Export

- **PDF:** Folien als SVG in einem versteckten Frame rendern und den Druckdialog des
  Browsers öffnen („Als PDF speichern“). Fonts über `@font-face` einbetten. Muss pixelgleich
  zum Editor sein (gleiches SVG, gleiche Engine). Die CLI druckt dasselbe HTML headless.
- **PPTX:** Szenengraph → pptxgenjs. Master/Layouts werden zu PPTX-Mastern, Slots zu
  Platzhaltern, Notizen zu Sprechernotizen. Was PPTX nicht kennt (Ausdrücke, Auto-Layout),
  wird auf berechnete Positionen „eingefroren“. Nicht abbildbare Effekte als Bild rastern
  und im Export-Log vermerken. Ziel: in PowerPoint **editierbar**, nicht nur ansehbar.
- **ODP:** PPTX erzeugen und via `soffice --headless --convert-to odp` konvertieren. Nur in
  der CLI; in der App ausgegraut mit Hinweis auf die CLI.
- Textumbrüche können in PowerPoint abweichen (eigene Layout-Engine). Das ist bekannt
  und akzeptiert; Textboxen deshalb mit fester Breite und `autofit=none` exportieren.

---

## Checkliste: neue Operation hinzufügen

Eine neue Op ist erst fertig, wenn alles davon erledigt ist:

1. Grammatik/Parser + Fehlermeldungen
2. Printer (Round-Trip-Test: `print(parse(src)) === src`)
3. Evaluator inkl. Provenienz
4. Edit-Engine: welche Gesten erzeugen oder ändern diese Op
5. Renderer (SVG)
6. PPTX-Mapping (oder dokumentiertes Einfrieren/Rastern)
7. Autocomplete + Highlighting in CodeMirror
8. Referenzseite `docs/reference/<kategorie>/<op>.md` (Parameter mit Typ und Standard,
   Beispiele) und ggf. `docs/language.md` aktualisiert; der Docs-Test prüft, dass jede Op und
   jeder Schlüssel aus `vocab.ts` dokumentiert ist und alle Beispiele fehlerfrei rendern
9. Tests: Parse, Eval-Snapshot, Edit (Geste → erwarteter Text-Diff)

## Konventionen

- TypeScript strict, kein `any`, keine Default-Exports
- `core` enthält nur reine Funktionen; Seiteneffekte nur in `apps/web` und `export`
- Fehler der Sprache sind Daten (`Diagnostic[]` mit Quellbereich), keine Exceptions
- Kleine, fokussierte Commits; vor jedem Commit `pnpm test`
- UI-Texte auf Deutsch, Code, Bezeichner und Kommentare auf Englisch

## Meilensteine

1. **Sprachkern:** Parser, Printer, Evaluator, SVG-Render, CLI-Export nach PDF
2. **Split-View read-only:** Code links, Canvas rechts, synchrone Selektion
3. **Direkte Manipulation:** Verschieben, Skalieren, Ecken runden, Text bearbeiten, Rückschreiben
4. **Templates:** Theme-Dateien, Master, Layouts, Slots, Styles, Komponenten, Nummerierung
5. **Export:** PPTX mit Mastern und Notizen, ODP
6. **Feinschliff:** Snapping, Hilfslinien, Shortcuts, Kommandozeile, Folienübersicht, Präsentationsmodus
