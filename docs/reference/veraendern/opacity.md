---
summary: Deckkraft setzen.
---
# opacity

Setzt die Deckkraft zwischen `0` (unsichtbar) und `1` (deckend).

```forme
rect @a x=400 y=300 w=600 h=400 fill=$primary
rect @b x=800 y=420 w=600 h=400 fill=$accent
opacity @b 0.6
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

### wert
- Typ: Zahl
- positional
- erforderlich

Deckkraft zwischen `0` und `1`.
