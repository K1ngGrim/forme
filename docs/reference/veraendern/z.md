---
summary: Ebenenreihenfolge ändern.
---
# z

Ändert, welches Objekt oben liegt. Ohne `z` gilt die Reihenfolge der Zeilen: Was später erzeugt
wird, liegt oben.

```forme
rect @a x=400 y=300 w=600 h=400 fill=$primary
rect @b x=800 y=420 w=600 h=400 fill=$accent
z @a front
```

## Parameter

### @ziel
- Typ: ID
- positional
- erforderlich

Das Objekt.

### position
- Typ: Auswahl | Zahl
- positional
- Werte: `front`, `back`, `forward`, `backward`
- Standard: `front`

Ganz nach vorne, ganz nach hinten, eine Ebene vor oder zurück, oder eine Zahl als Position
(0 = ganz hinten).
