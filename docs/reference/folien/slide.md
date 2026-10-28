---
summary: Eine Folie, optional mit Layout und Master.
---
# slide

Beginnt eine Folie. Alle Zeilen in ihrem Block `{ … }` gehören zu ihr. Das Layout bestimmt Platzhalter,
Regionen und Hintergrund.

```forme
slide @kpis layout=content {
  fill @title "Kennzahlen"
  rect @karte x=content.x y=content.y w=600 h=300 radius=24 fill=$surface
}
```

## Parameter

### @id
- Typ: ID
- positional

Name der Folie, z. B. für Verweise im Editor und als Sprungziel.

### layout
- Typ: Name

Layout aus dem Theme (`title`, `content`, `blank` im Standard-Theme). Ohne Layout bleibt die
Folie leer bis auf den Master.

### master
- Typ: Name

Master statt des Masters, den das Layout vorgibt.

### hidden
- Typ: Wahrheitswert
- Standard: `false`

Ausgeblendete Folien werden nicht gezeigt, nicht gezählt (`{slide.n}`) und nicht exportiert.

```forme
deck "Mit Reserve"

slide @a layout=title {
  fill @title "Sichtbar"
}

slide @reserve layout=content hidden=true {
  fill @title "Backup-Folie"
}
```
