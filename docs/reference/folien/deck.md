---
summary: Kopf einer Präsentation mit ihrem Titel.
---
# deck

Die erste Zeile einer Präsentation. Der Titel steht als `{deck.title}` zur Verfügung, etwa in
einer Fußzeile, und wird beim Export als Dokumenttitel verwendet.

```forme
deck "Projektbericht 2026"

slide @a layout=title {
  fill @title "{deck.title}"
  fill @subtitle "{deck.total} Folien"
}
```

## Parameter

### titel
- Typ: Text
- positional
- erforderlich

Titel der Präsentation.
