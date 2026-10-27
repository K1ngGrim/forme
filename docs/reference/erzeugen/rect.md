---
summary: Rechteck, auf Wunsch mit abgerundeten Ecken, Kontur und Schatten.
---
# rect

Ein Rechteck ist die Grundform für Flächen, Karten und Hintergründe. Ohne Angaben ist es
200 × 120 Pixel groß und hellgrau.

```forme
rect @karte x=120 y=260 w=720 h=420 radius=32 fill=$primary
```

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts. Muss auf der Folie eindeutig sein.

### w
- Typ: Länge
- Standard: `200`

Breite.

### h
- Typ: Länge
- Standard: `120`

Höhe.

### fill
- Typ: Farbe
- Standard: `#D1D5DB`

Füllfarbe, `none` für eine leere Fläche mit Kontur.

<!-- gemeinsam: x y radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden like style in within span -->

## Beispiele

### Abgerundete Karte mit Schatten

```forme
rect @karte x=560 y=280 w=800 h=440 radius=40 fill=#FFFFFF stroke=#E5E7EB shadow.y=12 shadow.blur=40
```

### Nur Kontur, gestrichelt

```forme
rect @rahmen x=120 y=280 w=1680 h=480 fill=none stroke=$primary stroke.width=6 stroke.dash=18 radius=24
```

### Einzelne Ecken runden

```forme
rect @reiter x=120 y=300 w=720 h=360 fill=$accent radius.tl=80 radius.br=80
```

### Drei gleiche Karten

```forme
rect @k1 x=120 y=300 w=520 h=360 radius=24 fill=$surface
rect @k2 like=@k1
rect @k3 like=@k1
distribute h @k1 @k2 @k3 within=content
```
