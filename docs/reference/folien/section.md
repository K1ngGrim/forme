---
summary: Abschnitt beginnen; Name und Nummer für alle folgenden Folien.
---
# section

Beginnt einen Abschnitt. Alle folgenden Folien gehören dazu, bis der nächste `section` kommt. In
Texten stehen `{section}` (Name), `{section.n}` (Nummer) und `{deck.sections}` (Anzahl) zur
Verfügung, etwa für Kapiteltrenner „Teil 2 von 4“ oder eine Fußzeile.

```forme
deck "Bericht"

section "Einleitung"

slide @a layout=content {
  fill @title "{section}"
  text @teil "Teil {section.n} von {deck.sections}" x=120 y=300 size=48
}

section "Zahlen"

slide @b layout=content {
  fill @title "{section}"
  text @teil "Teil {section.n} von {deck.sections}" x=120 y=300 size=48
}
```

## Parameter

### name
- Typ: Text
- positional
- erforderlich

Name des Abschnitts.
