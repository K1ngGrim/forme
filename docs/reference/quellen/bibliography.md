---
summary: Literaturdatei (.bib) des Vortrags einbinden.
---
# bibliography

Bindet eine BibTeX-Datei ein. Danach zitiert `@schlüssel` in jedem Text eine Quelle daraus.
Mehrere `bibliography`-Zeilen sind möglich; bei doppelten Schlüsseln gilt der erste Eintrag.

```forme
deck "Projektbericht"
bibliography "./quellen.bib"

slide @a layout=content {
  fill @title "Grundlagen"
  text @t "Shortcut Learning @geirhos2020 und Clever-Hans-Effekte @lapuschkin2019." x=120 y=300 w=1600 size=40
}
```

Fehler in der .bib (fehlende Klammern, doppelte Schlüssel) erscheinen als Warnung an dieser
Zeile, mit Zeile und Spalte in der .bib. Änderungen an der Datei übernehmen Editor, VS Code und
`forme watch` sofort.

## Parameter

### pfad
- Typ: Text
- positional
- erforderlich

Pfad der .bib-Datei, relativ zur Deck-Datei.
