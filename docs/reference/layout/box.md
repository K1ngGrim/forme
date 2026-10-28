---
summary: Container mit eigenem Hintergrund, in dem Kinder frei positioniert werden – wie ein div.
---
# box

Eine Box ist ein Rechteck, das andere Objekte enthält: Füllung, Kontur, Radius und Schatten wie
bei [`rect`](../erzeugen/rect.md), dazu ein Innenabstand `pad`. Die Kinder in ihrem Block werden
**nicht** automatisch angeordnet (dafür gibt es [`row`](row.md) und [`column`](column.md)),
sondern stehen frei: ihre Koordinaten beziehen sich auf die linke obere Ecke der Innenfläche.
Verschiebt man die Box, wandern die Kinder mit.

```forme
box @karte x=120 y=260 w=900 fill=$surface radius=24 pad=48 {
  text @titel "Überschrift" size=56 weight=700
  text @inhalt "Der Text steht frei in der Box und bricht in ihrer Breite um." y=96 w=box.w size=32
  rect @linie y=@inhalt.bottom+32 w=box.w h=6 fill=$primary
}
```

Ohne `w` oder `h` passt sich die Box ihrem Inhalt an (plus Innenabstand). Innerhalb einer Box
mit fester Größe beziehen sich Prozentwerte auf die Innenfläche, und `box.w`, `box.h`,
`box.cx`, `box.cy` liefern deren Maße.

In einer [`row`](row.md) oder [`column`](column.md) ist eine Box ein normales Element: der
Container gibt ihr Breite und Höhe, ihre Kinder bleiben frei positioniert.

## Parameter

### @id
- Typ: ID
- positional

Name der Box.

### x
- Typ: Länge
- Standard: `0`

Horizontale Position.

### y
- Typ: Länge
- Standard: `0`

Vertikale Position.

### w
- Typ: Länge
- Standard: Breite des Inhalts plus Innenabstand

Breite der Box.

### h
- Typ: Länge
- Standard: Höhe des Inhalts plus Innenabstand

Höhe der Box.

```forme
box @rahmen x=120 y=260 w=1200 h=600 stroke=$primary stroke.width=4 radius=16 {
  ellipse @punkt x=(box.cx-60) y=(box.cy-60) w=120 h=120 fill=$accent
  text @ecke "unten rechts" x=100% y=100% anchor=right size=28
}
```

### pad
- Typ: Zahl
- Standard: `0`

Innenabstand: Abstand der Innenfläche vom Rand. Die Koordinaten der Kinder beginnen dort.

### fill
- Typ: Farbe

Hintergrund der Box. Ohne `fill` und `stroke` ist die Box unsichtbar und dient nur der
Anordnung.

<!-- gemeinsam: radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden like style in within span -->

## Beispiele

### Karten in einer Zeile

```forme
row @karten within=content gap=32 {
  box @a fill=$surface radius=24 pad=40 {
    text @a1 "Schneller" size=48 weight=700
    text @a2 "Durchlaufzeit −30 %" y=80 w=box.w size=30
  }
  box @b fill=$surface radius=24 pad=40 {
    text @b1 "Günstiger" size=48 weight=700
    text @b2 "Kosten je Vorgang gesenkt" y=80 w=box.w size=30
  }
  box @c fill=$primary radius=24 pad=40 {
    text @c1 "Besser" size=48 weight=700 color=#FFFFFF
    text @c2 "Kundenzufriedenheit 4,6 / 5" y=80 w=box.w size=30 color=#FFFFFF
  }
}
```

### Schatten und Prozentwerte

```forme
box @panel x=320 y=280 w=1280 h=520 fill=#FFFFFF radius=32 shadow.y=16 shadow.blur=48 pad=60 {
  rect @links w=48% h=100% radius=16 fill=$surface
  rect @rechts x=52% w=48% h=100% radius=16 fill=$accent
}
```
