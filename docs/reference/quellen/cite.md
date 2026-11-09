---
summary: Aussehen der Zitate im Text festlegen (Theme).
---
# cite

Legt im Theme fest, wie `@schlüssel` im Text erscheint. Das Format ist eine Zeichenkette mit
`{…}`-Ausdrücken; darin stehen die [Felder der Quelle](../quellen.md#felder-einer-quelle) unter
`ref.<feld>` und die Seitenangabe als `supplement`. Ohne `cite` erscheint `[1]` bzw.
`[1, S. 4]`.

```forme
cite format="({ref.author} {ref.year}{supplement})"
---
slide @a layout=content {
  fill @title "Autor-Jahr"
  text @t "Wie in @geirhos2020[S. 667] gezeigt, hilft das auch hier @knuth1984." x=120 y=300 w=1600 size=40
}
```

## Parameter

### format
- Typ: Text
- Standard: `"[{ref.n}{supplement}]"`

Zitat im Text. `{supplement}` ist leer, wenn das Zitat keine Seitenangabe hat. Markup wie
`*kursiv*` ist erlaubt.

```forme
cite format="^{ref.n}^" supplement=""
---
slide @a layout=content {
  fill @title "Fußnotenstil"
  text @t "Shortcut Learning @geirhos2020 tritt häufig auf @arp2022." x=120 y=300 w=1600 size=40
}
```

### supplement
- Typ: Text
- Standard: `", {page}"`

Wie die Angabe in Klammern hinter dem Schlüssel (`@key[S. 4]`) in `{supplement}` erscheint;
`{page}` ist der Text in den Klammern.

```forme
cite format="[{ref.n}{supplement}]" supplement=": {page}"
---
slide @a layout=content {
  fill @title "Seitenangaben"
  text @t "Siehe @arp2022[Abschnitt 3]." x=120 y=300 w=1600 size=40
}
```
