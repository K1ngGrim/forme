---
summary: Objekte in ein Raster mit gleich breiten Spalten setzen.
---
# grid

Setzt Objekte zeilenweise in ein Raster. Alle Objekte bekommen die Spaltenbreite, die Zeilenhöhe
richtet sich nach dem höchsten Objekt der Zeile (oder `rowh`).

```forme
rect @a h=200 fill=$primary
rect @b h=200 fill=$accent
rect @c h=200 fill=$muted
rect @d h=200 fill=$surface
grid @a @b @c @d cols=2 gap=32 within=content
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Die Objekte, zeilenweise von links nach rechts.

### cols
- Typ: Zahl
- Standard: `2`

Anzahl der Spalten.

### gap
- Typ: Zahl
- Standard: `24`

Abstand zwischen Spalten und Zeilen.

### within
- Typ: Region | ID

Position und Breite aus einer Region oder einem Objekt.

### x
- Typ: Länge
- Standard: Position des ersten Objekts

Linke Kante des Rasters.

### y
- Typ: Länge
- Standard: Position des ersten Objekts

Obere Kante des Rasters.

### w
- Typ: Länge

Gesamtbreite des Rasters.

### rowh
- Typ: Länge

Feste Höhe aller Zeilen.

```forme
rect @a fill=$primary
rect @b fill=$accent
rect @c fill=$muted
grid @a @b @c cols=3 gap=24 x=120 y=300 w=1680 rowh=360
```
