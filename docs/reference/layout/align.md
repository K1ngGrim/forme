---
summary: Objekte an einer Kante oder Mitte ausrichten.
---
# align

Richtet Objekte aneinander, an der Folie oder an einer Region aus. Ohne `to` gilt die gemeinsame
Box aller Ziele, bei einem einzelnen Ziel die Folie.

```forme
rect @a x=200 y=300 w=300 h=200 fill=$primary
rect @b x=700 y=420 w=300 h=300 fill=$accent
rect @c x=1200 y=360 w=300 h=120 fill=$muted
align top @a @b @c
```

## Parameter

### richtung
- Typ: Auswahl
- positional
- erforderlich
- Werte: `left`, `center`, `right`, `top`, `middle`, `bottom`

Kante oder Mitte: `left`, `center` und `right` wirken horizontal, `top`, `middle` und `bottom`
vertikal.

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### to
- Typ: Region | ID | Auswahl
- Werte: `slide`, `first`, `last`

Bezug: `slide`, eine Region (`content`), ein Objekt (`@titel`) oder `first`/`last` für das erste
bzw. letzte Ziel.

```forme
rect @a x=200 y=300 w=300 h=200 fill=$primary
rect @b x=700 y=500 w=300 h=300 fill=$accent
align center @a @b to=slide
```

## Beispiele

### Mittig auf der Folie

```forme
text @t "Genau in der Mitte" size=72 weight=700
align center @t
align middle @t
```
