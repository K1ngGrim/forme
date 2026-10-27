---
summary: Gerade Linie zwischen zwei Punkten; mit `arrow` als Pfeil.
aliases: arrow
---
# line

Eine Linie verbindet den Punkt (`x`, `y`) mit (`x2`, `y2`). `arrow` ist dieselbe Operation mit
Pfeilspitze.

```forme
line @trenner x=120 y=540 x2=1800 y2=540 stroke=$muted stroke.width=4
```

## arrow

Pfeil zwischen zwei Punkten. Der Schlüssel `head` legt fest, wo Spitzen sitzen.

```forme
rect @a x=160 y=440 w=360 h=200 radius=24 fill=$surface
rect @b x=1400 y=440 w=360 h=200 radius=24 fill=$primary
arrow @pfeil x=@a.right+24 y=@a.cy x2=@b.left-24 y2=@b.cy stroke.width=8
```

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### x
- Typ: Länge
- Standard: `0`

Horizontale Position des Startpunkts.

### y
- Typ: Länge
- Standard: `0`

Vertikale Position des Startpunkts.

### x2
- Typ: Länge
- Standard: `x + 200`

Horizontale Position des Endpunkts.

### y2
- Typ: Länge
- Standard: `y`

Vertikale Position des Endpunkts.

### stroke
- Typ: Farbe
- Standard: `#111827`

Linienfarbe.

### stroke.width
- Typ: Zahl
- Standard: `4`

Linienstärke.

### head
- Typ: Auswahl
- Werte: `end`, `start`, `both`, `none`
- Standard: `end` bei `arrow`, `none` bei `line`

Wo Pfeilspitzen gezeichnet werden.

```forme
arrow @hin x=200 y=420 x2=1720 y2=420 stroke.width=8 head=end
arrow @beide x=200 y=560 x2=1720 y2=560 stroke.width=8 head=both stroke=$primary
arrow @zurueck x=200 y=700 x2=1720 y2=700 stroke.width=8 head=start stroke=$accent
```

<!-- gemeinsam: stroke.dash opacity hidden like style in within span -->

## Beispiele

### Gestrichelte Hilfslinie

```forme
line @hilfe x=960 y=200 x2=960 y2=900 stroke=$accent stroke.width=4 stroke.dash=16
```

### Zeitstrahl

```forme
line @achse x=160 y=540 x2=1760 y2=540 stroke=$muted stroke.width=6
ellipse @p1 x=300 y=510 w=60 h=60 fill=$primary
ellipse @p2 like=@p1 x=930
ellipse @p3 like=@p1 x=1560
text @t1 "2024" x=@p1.cx y=600 anchor=center size=36
text @t2 "2025" x=@p2.cx y=600 anchor=center size=36
text @t3 "2026" x=@p3.cx y=600 anchor=center size=36
```
