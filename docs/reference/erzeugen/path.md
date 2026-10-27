---
summary: Freie Form aus SVG-Pfadbefehlen.
---
# path

Ein Pfad beschreibt eine Form mit SVG-Pfadbefehlen (`M`, `L`, `H`, `V`, `C`, `Q`, `S`, `T`, `A`,
`Z`). Wie bei [`polygon`](polygon.md) sind die Koordinaten relativ und werden mit `w` und `h`
skaliert.

```forme
path @welle x=120 y=360 w=1680 h=360 fill=$primary d="M0 60 C 150 0 250 120 400 60 L 400 120 L 0 120 Z"
```

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### d
- Typ: Text
- erforderlich

Pfaddaten im SVG-Format.

### w
- Typ: Länge
- Standard: Breite des Pfads

Skaliert den Pfad auf diese Breite.

### h
- Typ: Länge
- Standard: Höhe des Pfads

Skaliert den Pfad auf diese Höhe.

### fill
- Typ: Farbe
- Standard: `#D1D5DB`

Füllfarbe; `none` für eine reine Linie mit `stroke`.

<!-- gemeinsam: x y stroke stroke.width stroke.dash opacity shadow.x hidden like style in within span -->

## Beispiele

### Kurve als Linie

```forme
path @kurve x=200 y=300 w=1520 h=420 fill=none stroke=$accent stroke.width=12 d="M0 100 Q 50 0 100 100 T 200 100"
```

## Export

Pfade mit `M`, `L`, `H`, `V`, `C`, `Q` und `Z` werden in PowerPoint zu bearbeitbaren Formen.
Pfade mit `S`, `T` oder `A` werden als Bild eingebettet und im Export-Log vermerkt.
