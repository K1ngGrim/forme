---
summary: Textfeld mit Rich Text, automatischer Größe oder festem Umbruch.
---
# text

Ein Textfeld zeigt eine Zeichenkette. Ohne `w` ist es so breit wie der Text, mit `w` wird
umgebrochen. Ohne `h` ist es so hoch wie der Inhalt.

```forme
text @titel "Hallo Forme" x=120 y=300 size=96 weight=700
```

Innerhalb des Texts gelten **Markup-Regeln** ([Rich Text](../../language.md#rich-text)):
`**fett**`, `*kursiv*`, `[Link](https://…)`, `[farbig](#DC2626)` und `\n` für einen
Zeilenumbruch. Ausdrücke in `{…}` werden eingesetzt, z. B. `{slide.n}`.

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### inhalt
- Typ: Text
- positional

Der Text, z. B. `"Hallo"`. Darf Markup und `{…}`-Ausdrücke enthalten.

### w
- Typ: Länge
- Standard: Breite des Texts

Feste Breite: Der Text wird umgebrochen.

### h
- Typ: Länge
- Standard: Höhe des Inhalts

Feste Höhe. Erst damit wirkt `valign`.

### fill
- Typ: Farbe
- Standard: keine

Hintergrund der Textbox, zusammen mit `pad` und `radius`.

<!-- gemeinsam: x y size weight italic color font line align valign anchor pad radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden text like style in within span -->

## Beispiele

### Umbruch und Stil

```forme
text @absatz "Mit einer festen Breite bricht der Text um. Der Stil body kommt aus dem Theme." x=120 y=300 w=900 style=body
```

### Rich Text

```forme
text @t "Ein **fetter**, ein *kursiver* und ein [farbiger](#DC2626) Teil.\nZweite Zeile mit [Link](https://example.org)." x=120 y=320 w=1200 size=44
```

### Rechtsbündig am Rand

```forme
text @nummer "Folie {slide.n}" x=(slide.w-120) y=300 anchor=right size=40
```

### Zentriert in einer Box

```forme
text @label "Mittig in der Box" x=560 y=300 w=800 h=360 align=center valign=middle fill=#F3F4F6 radius=24 size=48
```
