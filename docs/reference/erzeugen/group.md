---
summary: Mehrere Objekte zusammenfassen, mit eigenen Koordinaten.
---
# group

Eine Gruppe fasst die Objekte in ihrem Block zusammen. Die Koordinaten der Kinder sind **relativ** zur
Gruppe; die Gruppe selbst wird mit `x` und `y` platziert. Verschiebt man die Gruppe, wandert
alles mit.

```forme
group @marke x=120 y=300 {
  ellipse @kreis x=0 y=0 w=160 h=160 fill=$primary
  text @name "Forme" x=@kreis.right+32 y=40 size=72 weight=700
}
```

Auch Bezüge wie `@kreis.right` liefern innerhalb der Gruppe relative Werte. Ausrichten mit
`align`, `distribute`, `stack` und `grid` ist in Gruppen nicht erlaubt; dafür gibt es
[`row`](../layout/row.md) und [`column`](../layout/column.md).

## Parameter

### @id
- Typ: ID
- positional

Name der Gruppe.

### x
- Typ: Länge
- Standard: `0`

Horizontale Position des Ursprungs der Gruppe.

### y
- Typ: Länge
- Standard: `0`

Vertikale Position des Ursprungs der Gruppe.

<!-- gemeinsam: opacity hidden span -->

## Beispiele

### Gruppe zweimal verwenden

```forme
group @a x=120 y=320 {
  rect @bg x=0 y=0 w=760 h=360 radius=32 fill=$surface
  text @t "Gruppe A" x=48 y=48 size=56
}
group @b x=1040 y=320 {
  rect @bg2 x=0 y=0 w=760 h=360 radius=32 fill=$primary
  text @t2 "Gruppe B" x=48 y=48 size=56 color=#FFFFFF
}
```
