# CLAUDE.md – Forme

Forme ist ein Desktop-Tool zum Erstellen von Präsentationen. Es verbindet einen Figma-artigen
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

Animationen, Übergänge, Echtzeit-Kollaboration, Cloud-Sync, Video-Einbettung, Plugins.
Diese Features nicht vorschlagen oder vorbereiten, solange nicht ausdrücklich gewünscht.

---

## Tech-Stack

- **Electron** (via electron-vite), **TypeScript strict**, **pnpm** Workspaces
- **React** + **Zustand** für die UI
- **SVG** als Renderer (Folien sind klein, kein WebGL nötig; gleiches Chromium auf allen Plattformen)
- **CodeMirror 6** für die Code-Ansicht (eigene Sprache, Highlighting, Fehler, Autocomplete)
- Parser: **handgeschrieben, rekursiver Abstieg** (Fehlertoleranz, verlustfreier CST)
- Export: Electron `printToPDF` (PDF), **pptxgenjs** (PPTX), LibreOffice headless (ODP)
- Tests: **Vitest** (Unit/Golden), **Playwright** für Electron (E2E)

## Projektstruktur

```
packages/
  core/      Lexer, Parser (CST), AST, Printer, Evaluator, Szenengraph, Edit-Engine
             → reines TypeScript, KEIN DOM, KEIN Node-API. Muss isoliert testbar sein.
  render/    Szenengraph → SVG
  export/    PDF, PPTX, ODP
apps/
  desktop/   Electron main / preload / renderer, Editor-UI
docs/
  language.md   Sprachreferenz (verbindlich, bei jeder Sprachänderung aktualisieren)
examples/       Beispiel-Decks und -Themes (dienen auch als Golden-Tests)
```

## Befehle

```
pnpm install      Abhängigkeiten installieren (lädt auch das Electron-Binary)
pnpm dev          Electron-App im Dev-Modus
pnpm test         alle Vitest-Tests (core, render, export)
pnpm test:e2e     Playwright E2E gegen die gebaute App (Linux ohne Display: xvfb-run -a pnpm test:e2e)
pnpm build        Produktions-Build der App (apps/desktop/out)
pnpm dist         Installer für das aktuelle Betriebssystem (apps/desktop/dist):
                  Windows: NSIS-Setup + portable .exe, macOS: .dmg, Linux: AppImage
pnpm typecheck    tsc für alle Pakete
pnpm forme render <deck.forme> --out out.pdf   CLI: rendern ohne UI (.pdf/.pptx/.odp/.html/.svg)
pnpm forme check <deck.forme>                  CLI: nur Diagnosen ausgeben
```

Hinweise:
- Die CLI druckt PDFs mit headless Chromium (playwright-core). Falls keins installiert ist:
  `npx playwright install chromium` oder Pfad per `FORME_CHROMIUM` setzen. Die App selbst
  nutzt Electrons `printToPDF`.
- `pnpm dev` und `start` laufen über `apps/desktop/scripts/electron-vite.ts`: Es löst das
  Electron-Binary vom App-Ordner aus auf, lädt es bei Bedarf nach und übergibt es per
  `ELECTRON_EXEC_PATH` an electron-vite (dessen eigene Suche im pnpm-Store kann ins Leere
  laufen). Build-Skripte für Electron sind in `pnpm-workspace.yaml` freigegeben.
- Golden-Snapshots der Beispiele liegen in `examples/__golden__/`. Aktualisieren mit
  `pnpm test -u`, danach den Diff prüfen.
- Pakete werden nicht vorgebaut: `core`, `render` und `export` werden als TypeScript-Quellen
  importiert (electron-vite bündelt sie, die CLI läuft über tsx).

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
- **Anordnen:** `align`, `distribute`, `stack` (Auto-Layout), `grid`
- **Nummerierung:** `counter`, `number`, Interpolation `{slide.n}`, `{deck.total}`,
  `{section}`, `{figure}`, eigene Zähler; `section "Name"` auf Folienebene
- **Definitionen (nur Theme):** `token`, `color`, `font`, `style`, `master`, `layout`,
  `region`, `component`
- **Sonstiges:** `notes` (Sprechernotizen, werden nach PPTX exportiert)

Text unterstützt Rich-Text-Runs (fett, kursiv, Farbe, Links) und Listen mit Ebenen.

---

## Synchronisation Editor ⇄ Datei

Ein zentraler Store hält pro Datei: Quelltext, CST, Auswertungsergebnis, Fehlerliste.

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

- **PDF:** Folien als SVG offscreen rendern, `printToPDF`. Fonts einbetten. Muss
  pixelgleich zum Editor sein.
- **PPTX:** Szenengraph → pptxgenjs. Master/Layouts werden zu PPTX-Mastern, Slots zu
  Platzhaltern, Notizen zu Sprechernotizen. Was PPTX nicht kennt (Ausdrücke, Auto-Layout),
  wird auf berechnete Positionen „eingefroren“. Nicht abbildbare Effekte als Bild rastern
  und im Export-Log vermerken. Ziel: in PowerPoint **editierbar**, nicht nur ansehbar.
- **ODP:** PPTX erzeugen und via `soffice --headless --convert-to odp` konvertieren.
  Ist LibreOffice nicht installiert, Option ausgrauen und Hinweis zeigen.
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
8. `docs/language.md` aktualisiert
9. Tests: Parse, Eval-Snapshot, Edit (Geste → erwarteter Text-Diff)

## Konventionen

- TypeScript strict, kein `any`, keine Default-Exports
- `core` enthält nur reine Funktionen; Seiteneffekte nur in `apps/desktop` und `export`
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
