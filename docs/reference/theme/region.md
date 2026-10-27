---
summary: Benannte Fläche eines Layouts für `within=` und Ausdrücke.
---
# region

Eine Region ist eine benannte Fläche im Layout. Sie ist unsichtbar und dient als Bezug:
`within=content` setzt ein Objekt auf die Fläche, `content.x` oder `content.w` liefern ihre
Maße, `distribute … within=content` verteilt darin.

```forme
layout raster master=default
  slot @title style=h2 x=120 y=120 w=1680
  region oben x=120 y=300 w=1680 h=280
  region unten x=120 y=620 w=1680 h=320
---
slide @a layout=raster
  fill @title "Regionen"
  rect @a within=oben radius=24 fill=$primary
  rect @b within=unten radius=24 fill=$surface
```

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name der Region.

### x
- Typ: Länge
- Standard: `0`

Linke Kante.

### y
- Typ: Länge
- Standard: `0`

Obere Kante.

### w
- Typ: Länge
- Standard: Folienbreite

Breite.

### h
- Typ: Länge
- Standard: Folienhöhe

Höhe.
