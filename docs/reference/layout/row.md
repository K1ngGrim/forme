---
summary: Container, der seine Kinder nebeneinander anordnet – wie eine Bootstrap-Zeile.
---
# row

Eine Zeile ordnet die Kinder in ihrem Block **nebeneinander** an. Kinder ohne feste Breite teilen
sich den Platz nach `span`; mit `cols` entsteht ein Raster wie in Bootstrap. Zeilen und
[Spalten](column.md) lassen sich verschachteln.

```forme
row @drei within=content gap=32 {
  rect @a fill=$primary radius=24
  rect @b fill=$accent radius=24
  rect @c fill=$muted radius=24
}
```

Koordinaten und Bezüge der Kinder sind relativ zum Container. Position und Größe der Kinder
vergibt der Container; ein späteres `set @a w=…` löst eine neue Anordnung aus.

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
- Standard: Breite des Inhalts

Breite. Ohne `w` passt sich die Zeile ihren Kindern an.

### h
- Typ: Länge
- Standard: Höhe des höchsten Kinds

Höhe der Zeile.

### gap
- Typ: Zahl
- Standard: `0`

Abstand zwischen den Kindern.

### pad
- Typ: Zahl
- Standard: `0`

Innenabstand zwischen Rand und Kindern.

### align
- Typ: Auswahl
- Werte: `start`, `center`, `end`, `stretch`
- Standard: `stretch`

Querachse (vertikal): Kinder ohne eigene Höhe füllen bei `stretch` die ganze Zeilenhöhe.

```forme
row @r x=120 y=300 w=1680 h=400 gap=32 align=center fill=$surface pad=32 {
  rect @a h=120 fill=$primary
  rect @b h=240 fill=$accent
  rect @c h=80 fill=$muted
}
```

### justify
- Typ: Auswahl
- Werte: `start`, `center`, `end`, `between`, `around`
- Standard: `start`

Verteilung freien Platzes auf der Hauptachse, wenn alle Kinder eine feste Breite haben.

```forme
row @r x=120 y=360 w=1680 justify=between {
  rect @a w=300 h=200 fill=$primary
  rect @b w=300 h=200 fill=$accent
  rect @c w=300 h=200 fill=$muted
}
```

### cols
- Typ: Zahl

Raster mit `cols` Spalten: Jedes Kind belegt `span` Spalten, bei Überlauf beginnt eine neue
Zeile. `cols=12` entspricht dem Bootstrap-Raster.

```forme
row @raster within=content cols=12 gap=24 {
  rect @a span=8 h=200 fill=$primary
  rect @b span=4 h=200 fill=$accent
  rect @c span=4 h=200 fill=$muted
  rect @d span=4 h=200 fill=$muted
  rect @e span=4 h=200 fill=$muted
}
```

### span
- Typ: Zahl
- Standard: `1`

Bei Kindern: Anteil am freien Platz. Ein Kind mit `span=2` wird doppelt so breit wie eines mit
`span=1`. Im `cols`-Raster die Anzahl belegter Spalten.

### fill
- Typ: Farbe

Hintergrund des Containers („Content-Block“), zusammen mit `radius`, `stroke` und `pad`.

<!-- gemeinsam: radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden like style in within -->

## Beispiele

### Feste Breite und Rest

```forme
row @r within=content gap=32 {
  rect @nav w=320 fill=$surface radius=24
  rect @inhalt fill=$primary radius=24
}
```

### Verschachtelt

```forme
row @haupt within=content gap=32 {
  column @links span=2 gap=24 {
    rect @oben h=300 fill=$primary radius=24
    row @unten gap=24 {
      rect @u1 h=200 fill=$accent radius=24
      rect @u2 h=200 fill=$accent radius=24
    }
  }
  rect @rechts fill=$surface radius=24
}
```

## Im Editor

Ziehen eines Kinds ordnet die Zeilen im Container um, Pfeiltasten verschieben es um eine
Position, Größe ändern schreibt `w=` in die Zeile des Kinds.
