---
summary: Platzhalter (Slot) des Layouts befüllen.
---
# fill

Befüllt einen Platzhalter des Layouts mit Text oder einem Bild. Weitere Schlüssel überschreiben
Eigenschaften des Platzhalters nur auf dieser Folie.

```forme
slide @a layout=title {
  fill @title "Hallo Forme"
  fill @subtitle "Präsentationen als Code" color=$primary
}
```

Leere Platzhalter erscheinen nur im Editor (gestrichelt), nicht im Export. Welche es gibt,
legt das Layout mit [`slot`](../theme/slot.md) fest.

## Parameter

### @slot
- Typ: ID
- positional
- erforderlich

Der Platzhalter, z. B. `@title`.

### inhalt
- Typ: Text | Pfad
- positional

Text (mit Markup) oder bei Bild-Platzhaltern der Bildpfad.

### eigenschaften
- Typ: Länge | Farbe | Zahl

Beliebige Eigenschaften des Platzhalters, z. B. `color=` oder `size=`.
