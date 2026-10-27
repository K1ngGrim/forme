---
summary: Vorhandene Objekte ändern – Eigenschaften, Position, Größe, Ecken, Kontur, Schatten, Sichtbarkeit, Ebene.
ops: set move resize round style stroke shadow opacity hide show z
---
# Verändern

Verändernde Operationen wirken auf Objekte, die vorher erzeugt wurden: auf derselben Folie, im
Master oder im Layout. Sie nehmen ein oder mehrere Ziele (`@a @b`) und schreiben Eigenschaften.
Was später steht, gewinnt.

```forme
rect @a x=200 y=300 w=400 h=300 fill=$primary
rect @b like=@a x=760
set @a @b radius=40
move @b dx=200 dy=60
opacity @b 0.5
```

Objekte aus Master oder Layout überschreibt eine Folie mit `set`, `hide` blendet sie aus. Die
Theme-Datei bleibt dabei unverändert.
