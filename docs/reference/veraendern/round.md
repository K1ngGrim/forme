---
summary: Ecken abrunden, alle gleich oder einzeln.
---
# round

Rundet die Ecken von Rechtecken, Textboxen, Bildern und Containern. Eine Zahl gilt für alle
Ecken, `tl`, `tr`, `br` und `bl` für einzelne.

```forme
rect @a x=200 y=300 w=600 h=400 fill=$primary
round @a 48
```

Im Editor zieht der orange Punkt in der Ecke eines ausgewählten Objekts den Radius auf.

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### radius
- Typ: Zahl
- positional

Radius für alle vier Ecken.

### tl
- Typ: Zahl

Oben links.

### tr
- Typ: Zahl

Oben rechts.

### br
- Typ: Zahl

Unten rechts.

### bl
- Typ: Zahl

Unten links.

```forme
rect @a x=200 y=300 w=600 h=400 fill=$accent
round @a tl=120 br=120
```
