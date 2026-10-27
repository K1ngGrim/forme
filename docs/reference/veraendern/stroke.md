---
summary: Kontur setzen – Farbe, Breite, Strichelung.
---
# stroke

Setzt die Kontur von Objekten. Farbe und Breite stehen als Positionsargumente oder als
Schlüssel. Ohne Breite wird `2` verwendet.

```forme
rect @a x=200 y=300 w=600 h=400 fill=none
stroke @a $primary 8
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### color
- Typ: Farbe

Konturfarbe (oder erstes Positionsargument).

### width
- Typ: Zahl
- Standard: `2`

Konturbreite (oder zweites Positionsargument).

### dash
- Typ: Zahl

Strichlänge für eine gestrichelte Kontur.

```forme
ellipse @k x=760 y=300 w=400 h=400 fill=#FFFFFF
stroke @k color=$accent width=12 dash=24
```
