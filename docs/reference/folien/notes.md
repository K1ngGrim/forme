---
summary: Sprechernotizen einer Folie.
---
# notes

Hängt eine Sprechernotiz an die Folie. Mehrere `notes`-Zeilen werden zusammengefügt. Notizen
erscheinen im Präsentationsmodus und werden nach PPTX exportiert.

```forme
slide @a layout=content {
  fill @title "Kennzahlen"
  notes "Wachstum im Süden betonen."
  notes "Danach zu den Kosten überleiten."
}
```

## Parameter

### text
- Typ: Text
- positional
- erforderlich

Die Notiz.
