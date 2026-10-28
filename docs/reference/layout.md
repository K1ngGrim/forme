---
summary: Objekte anordnen – Zeilen und Spalten wie in Bootstrap, Ausrichten, Verteilen, Stapeln, Raster.
ops: row column box align distribute stack grid
---
# Layout

Forme kennt zwei Arten, Objekte anzuordnen:

- **Container** ([`row`](layout/row.md), [`column`](layout/column.md)) enthalten ihre Kinder
  in ihrem Block `{ … }` und verteilen den Platz wie Zeilen und Spalten in Bootstrap oder CSS-Flexbox.
  Container lassen sich beliebig verschachteln.
- **Boxen** ([`box`](layout/box.md)) sind Container mit eigenem Hintergrund und Innenabstand,
  in denen die Kinder frei stehen – wie ein `div`.
- **Anordnungs-Operationen** ([`align`](layout/align.md), [`distribute`](layout/distribute.md),
  [`stack`](layout/stack.md), [`grid`](layout/grid.md)) wirken auf Objekte, die schon existieren.

```forme
row @haupt within=content gap=40 {
  column @links span=2 gap=24 fill=$surface radius=24 pad=40 {
    text @lead "Zwei Drittel der Breite" size=48 weight=700
    text @mehr "Container verteilen den Platz, die Kinder brauchen keine Koordinaten." size=32 w=900
  }
  column @seite fill=$primary radius=24 pad=40 {
    text @s "Ein Drittel" size=48 color=#FFFFFF
  }
}
```

Beide Arten sind *semantisch*: Die Positionen werden bei jeder Auswertung neu berechnet. Wird ein
so platziertes Objekt im Editor verschoben, schreibt Forme eine `set`-Zeile dahinter
(siehe [Rückschreibe-Regeln](../language.md#synchronisation-mit-dem-editor-rückschreibe-regeln)).
In der Werkzeugleiste schreibt Alt-Klick stattdessen die berechneten Zahlen („backen“).
