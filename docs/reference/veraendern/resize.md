---
summary: Breite und Höhe setzen.
---
# resize

Setzt die Größe von Objekten, als Positionsargumente oder mit `w`/`h`.

```forme
rect @a x=200 y=300 fill=$primary
resize @a 800 400
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### w
- Typ: Länge

Neue Breite (oder erstes Positionsargument).

### h
- Typ: Länge

Neue Höhe (oder zweites Positionsargument).

```forme
rect @a x=200 y=300 w=400 h=300 fill=$accent
resize @a w=1200
```
