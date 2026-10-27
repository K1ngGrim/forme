---
summary: Container, der seine Kinder untereinander anordnet.
---
# column

Eine Spalte ordnet ihre eingerückten Kinder **untereinander** an. Kinder ohne eigene Breite
füllen die Spaltenbreite (`align=stretch`), die Höhe kommt aus dem Inhalt. Nur Kinder mit `span`
teilen sich zusätzlich freie Höhe.

```forme
column @c x=120 y=260 w=900 gap=24 pad=40 fill=$surface radius=24
  text @t1 "Überschrift" size=56 weight=700
  text @t2 "Text unter der Überschrift, in voller Breite der Spalte umgebrochen." size=32
  rect @linie h=6 fill=$primary
```

## Parameter

### @id
- Typ: ID
- positional

Name des Containers.

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
- Standard: Breite des breitesten Kinds

Breite der Spalte.

### h
- Typ: Länge
- Standard: Höhe des Inhalts

Feste Höhe. Kinder mit `span` teilen sich dann die freie Höhe.

```forme
column @c x=120 y=260 w=600 h=640 gap=24
  rect @kopf h=120 fill=$primary radius=16
  rect @mitte span=1 fill=$surface radius=16
  rect @fuss h=120 fill=$accent radius=16
```

### gap
- Typ: Zahl
- Standard: `0`

Abstand zwischen den Kindern.

### pad
- Typ: Zahl
- Standard: `0`

Innenabstand.

### align
- Typ: Auswahl
- Werte: `start`, `center`, `end`, `stretch`
- Standard: `stretch`

Querachse (horizontal): bei `stretch` füllen Kinder ohne eigene Breite die Spalte.

### justify
- Typ: Auswahl
- Werte: `start`, `center`, `end`, `between`, `around`
- Standard: `start`

Verteilung freier Höhe, wenn die Spalte eine feste Höhe hat.

### span
- Typ: Zahl
- Standard: `1`

Bei Kindern: Anteil an der freien Höhe. In einer Spalte bekommen nur Kinder mit `span` freie
Höhe ab.

### fill
- Typ: Farbe

Hintergrund des Containers.

<!-- gemeinsam: radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden like style in within -->
