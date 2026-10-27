---
summary: Objekte lückenlos hintereinander stapeln (Auto-Layout).
---
# stack

Stapelt Objekte horizontal (`h`) oder vertikal (`v`) mit festem Abstand, beginnend beim ersten
Objekt oder bei `x`/`y`. Ändert sich die Größe eines Objekts, rücken die folgenden nach.

```forme
text @titel "Überschrift" size=72 weight=700
text @unter "Darunter, mit 24 px Abstand" size=40
text @mehr "Und noch eine Zeile" size=40
stack v @titel @unter @mehr gap=24 x=120 y=300
```

## Parameter

### richtung
- Typ: Auswahl
- positional
- erforderlich
- Werte: `h`, `v`

Horizontal oder vertikal.

### @ziele
- Typ: ID
- positional
- erforderlich

Die Objekte, in dieser Reihenfolge.

### gap
- Typ: Zahl
- Standard: `0`

Abstand zwischen den Objekten.

### align
- Typ: Auswahl
- Werte: `start`, `center`, `end`
- Standard: `start`

Ausrichtung quer zur Stapelrichtung.

```forme
rect @a w=200 h=360 fill=$primary
rect @b w=200 h=200 fill=$accent
rect @c w=200 h=100 fill=$muted
stack h @a @b @c gap=32 x=600 y=300 align=center
```

### x
- Typ: Länge
- Standard: Position des ersten Objekts

Startposition horizontal.

### y
- Typ: Länge
- Standard: Position des ersten Objekts

Startposition vertikal.
