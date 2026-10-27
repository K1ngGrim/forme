---
summary: Vieleck aus einer Liste von Punkten.
---
# polygon

Ein Polygon verbindet Punkte zu einer geschlossenen Fläche. Die Punkte sind relativ: Forme
verschiebt sie so, dass die linke obere Ecke ihrer Box bei (`x`, `y`) liegt. Mit `w` und `h`
wird die Form auf diese Größe skaliert.

```forme
polygon @dreieck x=760 y=280 points="200,0 400,400 0,400" fill=$primary
```

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### points
- Typ: Text
- erforderlich

Punkte als `"x,y x,y …"`, durch Leerzeichen getrennt.

### w
- Typ: Länge
- Standard: Breite der Punkte

Skaliert die Form auf diese Breite.

### h
- Typ: Länge
- Standard: Höhe der Punkte

Skaliert die Form auf diese Höhe.

### fill
- Typ: Farbe
- Standard: `#D1D5DB`

Füllfarbe.

<!-- gemeinsam: x y stroke stroke.width stroke.dash opacity shadow.x hidden like style in within span -->

## Beispiele

### Stern

```forme
polygon @stern x=760 y=280 w=400 h=400 fill=$accent points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"
```

### Pfeilform als Fläche

```forme
polygon @schild x=320 y=380 w=1280 h=320 fill=$primary points="0,0 80,0 100,50 80,100 0,100 20,50"
```
