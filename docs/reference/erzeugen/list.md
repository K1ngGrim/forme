---
summary: Aufzählung mit Ebenen, Nummern oder ohne Zeichen; Einträge mit `item`.
aliases: item
---
# list

Eine Liste ordnet ihre Einträge untereinander an. Jeder Eintrag ist eine eingerückte
`item`-Zeile.

```forme
list @punkte x=120 y=300 w=1200 size=44
  item "Ausgangslage"
  item "Ergebnisse"
  item "Kennzahlen" level=2
  item "Nächste Schritte"
```

## item

Ein Listeneintrag. Steht nur eingerückt unter `list`. Text mit Markup wie bei
[`text`](text.md), `level` rückt ein.

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### bullet
- Typ: Auswahl
- Werte: `disc`, `dash`, `number`, `none`
- Standard: `disc`

Aufzählungszeichen. `disc` wechselt je Ebene das Zeichen (•, –, ◦, ▪), `number` zählt pro
Ebene.

### level
- Typ: Zahl
- Standard: `1`

Bei `item`: Ebene des Eintrags. Ebene 2 und tiefer werden eingerückt.

### line
- Typ: Zahl
- Standard: `1.3`

Zeilenhöhe als Vielfaches der Schriftgröße.

<!-- gemeinsam: x y w h size weight italic color font align valign anchor pad fill stroke stroke.width stroke.dash opacity shadow.x hidden text like style in within span -->

## Beispiele

### Nummeriert

```forme
list @schritte x=120 y=300 w=1200 size=44 bullet=number
  item "Daten sammeln"
  item "Auswerten"
  item "Teilbereich A" level=2
  item "Teilbereich B" level=2
  item "Vorstellen"
```

### Ohne Zeichen, mit Markup

```forme
list @fakten x=120 y=300 w=1400 size=44 bullet=none
  item "**640** Aufträge"
  item "**98 %** Termintreue"
  item "*Quelle: interne Auswertung*" level=2
```
