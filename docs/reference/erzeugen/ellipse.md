---
summary: Ellipse oder Kreis innerhalb einer Box.
---
# ellipse

Eine Ellipse füllt die Box aus `x`, `y`, `w` und `h`. Bei gleicher Breite und Höhe entsteht
ein Kreis.

```forme
ellipse @kreis x=760 y=330 w=400 h=400 fill=$primary
```

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### w
- Typ: Länge
- Standard: `200`

Breite der umgebenden Box.

### h
- Typ: Länge
- Standard: `120`

Höhe der umgebenden Box.

### fill
- Typ: Farbe
- Standard: `#D1D5DB`

Füllfarbe.

<!-- gemeinsam: x y stroke stroke.width stroke.dash opacity shadow.x hidden like style in within span -->

## Beispiele

### Ringe

```forme
ellipse @r1 x=560 y=140 w=800 h=800 fill=#DBEAFE
ellipse @r2 x=710 y=290 w=500 h=500 fill=#93C5FD
ellipse @r3 x=860 y=440 w=200 h=200 fill=$primary
```

### Kreis mit Kontur

```forme
ellipse @ring x=760 y=330 w=400 h=400 fill=none stroke=$accent stroke.width=24
```
