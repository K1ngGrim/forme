# Forme für VS Code

Präsentationen als Code schreiben und dabei die Folien live sehen. Die `.forme`-Datei bleibt die
Quelle der Wahrheit: Verschieben, Skalieren und Löschen in der Vorschau ändert den Text, jede
Geste ist ein normaler Undo-Schritt im Editor.

- **Forme-Editor** („Forme: Im Forme-Editor öffnen“, Rechtsklick im Explorer oder „Öffnen mit …“):
  der komplette Editor der Web-App als VS Code-Tab, mit Canvas, Zeichenwerkzeugen, Ausrichten,
  Folienliste, Inspector, Kommandozeile und Theme-Modus. Die Datei bleibt ein normales
  Textdokument; jede Geste ist eine kleine Textänderung, der Texteditor daneben bleibt synchron.
- **Vorschau** (`Strg+K V` oder das Symbol oben rechts): alle Folien, aktualisiert bei jedem
  Tastendruck. Klick wählt ein Objekt aus und springt zu seiner Zeile; der Cursor in einer
  Zeile markiert das Objekt in der Vorschau. Ziehen verschiebt (Umschalt: nur eine Achse), die
  Eck-Griffe skalieren, Pfeiltasten schieben um 1 px (Umschalt: 10 px), Entf löscht,
  Doppelklick bearbeitet Text. Folien mit Fehlern bleiben im letzten gültigen Stand sichtbar.
- **Sprache:** Hervorhebung, Fehler und Warnungen beim Tippen (auch für die Theme-Datei),
  Autovervollständigung für Befehle, Eigenschaften, `@IDs`, `$Tokens`, Styles und Layouts,
  Gliederung (Folien und Objekte), Gehe zu Definition (auch in das Theme), alle Verweise,
  Umbenennen von IDs (F2), Farbvorschau mit Farbwähler, Hover mit berechneter Position.
- **Export:** PDF, PPTX, HTML, SVG und ODP über „Forme: Exportieren …“. PDF braucht Chrome,
  Edge oder Chromium (wird automatisch gesucht, sonst Einstellung `forme.chromiumPath`).
- **Neue Präsentation aus Vorlage:** dieselben Vorlagen wie in der Web-App.
- **Auf Klammer-Syntax umstellen:** wandelt Dateien der früheren Einrückungs-Syntax um.

Die Sprache ist in `docs/language.md` beschrieben, Beispiele in `docs/guide.md`.
