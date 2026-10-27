---
summary: Beliebige Eigenschaften eines oder mehrerer Objekte setzen.
---
# set

`set` schreibt Eigenschaften auf vorhandene Objekte. Erlaubt sind alle Schlüssel, die das
jeweilige Objekt kennt (bei einem `rect` also `x`, `fill`, `radius` …, bei Text auch `size`,
`text` …).

```forme
rect @karte x=120 y=300 w=600 h=360 fill=$surface
set @karte fill=$primary radius=48 w=900
```

Der Editor schreibt `set`-Zeilen, wenn ein Wert berechnet ist (Ausdruck, `align`, Layout) und man
das Objekt trotzdem verschiebt: Die Zeile steht direkt nach der letzten Operation, die das Objekt
betrifft, und wird bei weiteren Gesten aktualisiert.

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### eigenschaften
- Typ: Länge | Farbe | Text | Zahl

Beliebige Schlüssel der Ziele, z. B. `x=`, `fill=`, `text=`, `size=`, `hidden=`, bei Containern
auch `gap=` und `span=`.

## Beispiele

### Platzhalter aus dem Layout verschieben

```forme
slide @a layout=content
  fill @title "Titel weiter unten"
  set @title y=400 color=$primary
```

### Mehrere Objekte auf einmal

```forme
rect @a x=120 y=300 w=400 h=300
rect @b x=760 y=300 w=400 h=300
rect @c x=1400 y=300 w=400 h=300
set @a @b @c fill=$accent radius=24
```
