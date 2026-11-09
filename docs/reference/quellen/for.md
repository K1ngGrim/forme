---
summary: Einen Block für jede Quelle wiederholen – Quellen pro Folie, Literaturliste.
---
# for

Wiederholt die Operationen im Block für jede Quelle einer Liste. Im Block steht die Quelle unter
dem gewählten Namen bereit, mit allen [Feldern](../quellen.md#felder-einer-quelle):
`ref.title`, `ref.authors`, `ref.year` …

```forme
slide @lit layout=content {
  fill @title "Literatur"
  text @hinweis "Zitiert: @geirhos2020, @arp2022, @lapuschkin2019" style=caption x=120 y=240
  column @liste x=120 y=300 w=1680 gap=24 {
    for ref in deck.refs {
      text @eintrag "[{ref.n}] {ref.authors}: *{ref.title}*. {ref.venue}, {ref.year}." size=30
    }
  }
}
```

Objekte im Block bekommen pro Durchlauf eine eigene ID: aus `@eintrag` werden `@eintrag_1`,
`@eintrag_2` … Innerhalb des Blocks meint `@eintrag` das Objekt des aktuellen Durchlaufs, so dass
sich Objekte aufeinander beziehen können. `for` steht in Folien, Mastern, Layouts und in
Containern; in einer [`column`](../layout/column.md) oder [`row`](../layout/row.md) ordnen sich
die erzeugten Objekte von selbst an.

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name, unter dem die Quelle im Block erreichbar ist, z. B. `ref`. Danach folgt das Wort `in`.

### liste
- Typ: Name
- Werte: `slide.refs`, `deck.refs`, `bib`
- positional
- erforderlich

Welche Quellen: die auf dieser Folie zitierten (`slide.refs`), alle im Vortrag zitierten in
Zitat-Reihenfolge (`deck.refs`) oder alle Einträge der .bib (`bib`).

## Beispiele

### Quellen am unteren Rand jeder Folie (Master)

```forme
master default {
  background fill=#FFFFFF
  if slide.refs {
    line @trenner x=$margin y=920 x2=(slide.w-$margin) y2=920 stroke=$muted stroke.width=1
    column @quellen x=$margin y=936 w=(slide.w-2*$margin) gap=2 {
      for ref in slide.refs {
        text @q "{ref.n}. {ref.author} ({ref.year}): {ref.title}" style=caption
      }
    }
  }
}
---
slide @a layout=content {
  fill @title "Motivation"
  text @t "Modelle lernen Abkürzungen @geirhos2020, auch in IDS @arp2022." x=120 y=300 w=1600 size=40
}
```

### Karten pro Quelle

```forme
slide @k layout=content {
  fill @title "Kernquellen"
  text @z "@geirhos2020 @lapuschkin2019" style=caption x=120 y=240
  row @karten within=content gap=32 {
    for ref in slide.refs {
      box @karte fill=$surface radius=24 pad=32 {
        text @jahr "{ref.year}" size=56 weight=700 color=$primary
        text @titel "{ref.title}" y=80 w=box.w size=26
      }
    }
  }
}
```
