---
summary: Objekte relativ verschieben.
---
# move

Verschiebt Objekte um einen Betrag. Die Beträge stehen als Positionsargumente oder als `dx`/`dy`.

```forme
rect @a x=200 y=300 w=400 h=300 fill=$muted
rect @b like=@a fill=$primary
move @b 160 80
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### dx
- Typ: Länge
- Standard: `0`

Horizontaler Betrag. Auch als erstes Positionsargument nach den Zielen.

### dy
- Typ: Länge
- Standard: `0`

Vertikaler Betrag. Auch als zweites Positionsargument.

```forme
text @t "Etwas tiefer" x=120 y=300 size=64
move @t dy=200
```
