---
summary: Folienvorlage mit Platzhaltern, Regionen und Hintergrund.
---
# layout

Ein Layout ist die Vorlage einer Folienart: Es legt Platzhalter ([`slot`](slot.md)), Flächen
([`region`](region.md)), Hintergrund und feste Objekte fest. Folien wählen es mit
`slide @id layout=name`.

```forme
layout zweispaltig master=default
  slot @title style=h2 x=120 y=120 w=1680
  region links x=120 y=300 w=800 h=600
  region rechts x=1000 y=300 w=800 h=600
---
slide @a layout=zweispaltig
  fill @title "Zwei Spalten"
  rect @l within=links radius=24 fill=$surface
  rect @r within=rechts radius=24 fill=$primary
```

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name des Layouts.

### master
- Typ: Name
- Standard: `default`

Master, auf dem das Layout aufbaut.
