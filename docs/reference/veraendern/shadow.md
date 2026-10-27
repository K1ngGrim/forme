---
summary: Schlagschatten hinzufügen oder entfernen.
---
# shadow

Gibt Objekten einen Schlagschatten. Nicht angegebene Werte nehmen den Standard.
`shadow @a none` entfernt ihn.

```forme
rect @karte x=560 y=280 w=800 h=440 radius=32 fill=#FFFFFF
shadow @karte
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### none
- Typ: Auswahl
- positional

`shadow @a none` entfernt den Schatten.

### x
- Typ: Zahl
- Standard: `0`

Versatz nach rechts.

### y
- Typ: Zahl
- Standard: `8`

Versatz nach unten.

### blur
- Typ: Zahl
- Standard: `24`

Unschärfe.

### color
- Typ: Farbe
- Standard: `rgba(0,0,0,0.25)`

Schattenfarbe.

```forme
rect @karte x=560 y=280 w=800 h=440 radius=32 fill=#FFFFFF
shadow @karte y=24 blur=64 color=rgba(37,99,235,0.45)
```
