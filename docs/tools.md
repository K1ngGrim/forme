# Werkzeuge

## Kommandozeile

Die Kommandozeile `forme` baut Präsentationen ohne Oberfläche, ähnlich wie `typst`. Sie nutzt
denselben Compiler wie der Editor; das PDF sieht deshalb genauso aus wie die Folien im Editor.

```
forme init vortrag -t hka-seminar      # neues Projekt aus einer Vorlage
forme watch vortrag/deck.forme         # PDF bei jeder Änderung neu erzeugen
forme compile vortrag/deck.forme       # einmal bauen: vortrag/deck.pdf
forme compile vortrag/deck.forme vortrag.pptx
forme check vortrag/deck.forme         # nur Fehler und Warnungen
```

### Befehle

| Befehl | Wirkung |
| --- | --- |
| `forme compile <deck> [ausgabe]` | Erzeugt die Ausgabe. Ohne Ausgabe: `<deck>.pdf`. Bei Fehlern wird nichts geschrieben (Exit-Code 1). |
| `forme watch <deck> [ausgabe]` | Wie `compile`, danach bei jeder Änderung an Deck, Theme, Schriften und Bildern erneut. Strg+C beendet. |
| `forme check <deck> [--json]` | Gibt Fehler und Warnungen mit Quelltext-Ausschnitt aus. `--json` liefert sie maschinenlesbar. |
| `forme init [ordner] [-t vorlage]` | Legt ein Projekt an. Vorhandene Dateien werden nie überschrieben. |
| `forme templates` | Listet die Vorlagen. |
| `forme migrate <datei\|ordner> [--check]` | Stellt Dateien der früheren Einrückungs-Syntax auf Blöcke in `{ }` um (Ordner rekursiv). Nur Klammern werden eingefügt. `--check` ändert nichts und endet mit Code 1, wenn noch Dateien umzustellen sind. |

### Ausgabeformate

Das Format ergibt sich aus der Dateiendung oder aus `--format`:

| Endung | Ergebnis |
| --- | --- |
| `.pdf` | wie der Druck aus der App. Braucht Chrome, Edge oder Chromium. |
| `.pptx` | in PowerPoint editierbar, mit Mastern, Platzhaltern und Notizen |
| `.odp` | über LibreOffice (`soffice` muss installiert sein) |
| `.html` | eine Seite pro Folie |
| `.svg` | eine Folie (`--slide <id>`); mit `{n}` im Dateinamen alle Folien, z. B. `folie-{n}.svg` |

### Optionen

| Option | Bedeutung |
| --- | --- |
| `-o, --out <datei>` | Ausgabedatei statt des zweiten Arguments |
| `-f, --format <fmt>` | `pdf`, `pptx`, `odp`, `html` oder `svg` |
| `--slide <id>` | nur diese Folie (SVG) |
| `--chromium <pfad>` | Browser für PDF. Sonst `FORME_CHROMIUM`, Playwrights Chromium, Google Chrome oder Microsoft Edge |
| `--no-color` | Ausgabe ohne Farben |

### Fehlermeldungen

`forme check` zeigt jede Meldung mit Datei, Zeile und Spalte und markiert die Stelle:

```text
Fehler: Unbekanntes Objekt „@nope“
   ┌─ vortrag/deck.forme:58:16
58 │   rect @a like=@nope x=10
   │                ^^^^^
```

### Installation

```text
npm install -g @k1nggrim/forme
```

Voraussetzungen, Installation aus einem GitHub-Release oder aus dem Quellcode und LibreOffice für ODP stehen unter
[Installation](install.md#kommandozeile). Im Repository geht es auch ohne Installation mit
`pnpm forme <befehl>`.

## VS Code

Die Erweiterung bringt Forme in VS Code: die Sprache mit allen Editor-Funktionen, eine
Live-Vorschau neben dem Code und den kompletten Forme-Editor als eigenen Editor-Tab.

### Forme-Editor

„Forme: Im Forme-Editor öffnen“ (Symbol oben rechts, Rechtsklick im Explorer oder „Öffnen mit …“)
zeigt eine `.forme`-Datei im vollständigen Editor der Web-App: Canvas, Werkzeuge zum Zeichnen,
Ausrichten und Verteilen, Folienliste, Inspector, Kommandozeile, Theme-Modus und Präsentieren.

- Die Datei bleibt ein normales Textdokument von VS Code. Jede Geste wird als kleine Textänderung
  geschrieben; der Texteditor daneben („Text daneben“) zeigt sie sofort, und was dort getippt wird,
  erscheint sofort auf dem Canvas.
- Klick auf ein Objekt springt im Texteditor zu seiner Zeile, der Cursor im Text markiert das
  Objekt auf dem Canvas.
- Strg+Z/Strg+Umschalt+Z nutzen einen gemeinsamen Verlauf für Deck und Theme, Strg+S speichert
  das Deck und ein im Theme-Modus geändertes Theme, Strg+K öffnet die Kommandozeile,
  Strg+Umschalt+T schaltet den Theme-Modus, F5 präsentiert.
- „Code“ blendet zusätzlich die Code-Ansicht der Web-App im Tab ein.
- Export (PDF, PPTX, ODP) läuft über die Erweiterung, wie „Forme: Exportieren …“.
- Der Editor sieht nur Dateien im Arbeitsbereichsordner der Präsentation.

### Sprache

- Hervorhebung, Fehler und Warnungen beim Tippen, für Deck und Theme, auch ungespeichert
- Autovervollständigung für Befehle, Schlüssel, `@IDs`, `$Tokens`, Styles und Layouts
- Gliederung (Folien und Objekte), Gehe zu Definition (auch ins Theme), alle Verweise
- Umbenennen von IDs (F2), Farbvorschau mit Farbwähler, Hover mit berechneter Position

### Vorschau

`Strg+K V` oder das Symbol oben rechts öffnet die Vorschau neben dem Code. Sie zeigt alle Folien
und folgt jedem Tastendruck.

| Du tust | Im Code passiert |
| --- | --- |
| Objekt anklicken | Der Cursor springt zu seiner Zeile, alle Zeilen, die es betreffen, werden markiert |
| Cursor in eine Zeile setzen | Das Objekt wird in der Vorschau markiert |
| Ziehen (Umschalt: nur eine Achse) | Position wird geschrieben, wie im Web-Editor |
| Eck-Griffe ziehen | Größe wird geschrieben |
| Pfeiltasten (Umschalt: 10 px) | Verschieben in kleinen Schritten |
| Entf | Objekt löschen (mit Warnung bei Bezügen) |
| Doppelklick auf Text | Text in einem Eingabefeld bearbeiten |

Jede Geste ist ein normaler Undo-Schritt in VS Code (Strg+Z). Folien mit Fehlern bleiben im
letzten gültigen Stand sichtbar und sind gesperrt, bis der Fehler behoben ist.

### Export und Vorlagen

„Forme: Exportieren …“ schreibt PDF, PPTX, HTML, SVG oder ODP. PDF braucht Chrome, Edge oder
Chromium; Forme sucht selbst, sonst die Einstellung `forme.chromiumPath`.
„Forme: Neue Präsentation aus Vorlage …“ legt ein Projekt aus denselben Vorlagen an wie die
Web-App.

„Forme: Auf Klammer-Syntax umstellen“ wandelt eine Datei der früheren Einrückungs-Syntax um, bei
einem Deck auch sein Theme. Die App zeigt dafür einen Hinweis mit Schaltfläche.

### Installation

`forme.vsix` aus dem [neuesten Release](https://github.com/K1ngGrim/forme/releases/latest) laden,
dann `code --install-extension forme.vsix` oder „Erweiterungen → … → Aus VSIX installieren“.
Mehr unter [Installation](install.md#vs-code).
