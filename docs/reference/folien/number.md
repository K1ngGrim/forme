---
summary: Zähler erhöhen und Abbildungen, Tabellen oder Eigenes beschriften.
---
# number

Erhöht einen Zähler und beschriftet auf Wunsch ein Objekt. Die Beschriftung ist ein eigenes
Textobjekt `@<ziel>_caption` unter (oder über) dem Ziel. Zähler laufen über alle Folien weiter;
`figure` und `table` gibt es immer, eigene legt [`counter`](counter.md) an.

```forme
image @chart "./img/umsatz.svg" x=120 y=260 w=800
number figure @chart caption="Abb. {figure}: Umsatz nach Region"
```

## Parameter

### zähler
- Typ: Name
- positional
- erforderlich

Name des Zählers (`figure`, `table` oder ein eigener).

### @ziel
- Typ: ID
- positional

Das Objekt, das beschriftet wird.

### caption
- Typ: Text

Beschriftung; `{figure}` (bzw. der Zählername) setzt die Nummer ein.

### pos
- Typ: Auswahl
- Werte: `below`, `above`
- Standard: `below`

Beschriftung unter oder über dem Ziel.

### gap
- Typ: Zahl
- Standard: `16`

Abstand zwischen Ziel und Beschriftung.

### style
- Typ: Stil
- Standard: `caption`, sonst `footer`

Textstil der Beschriftung.

## Beispiele

### Tabelle mit Beschriftung darüber

```forme
table @t x=120 y=340 w=1200 size=32 {
  row "Bereich" "2026"
  row "Vertrieb" "1,4 Mio €"
}
number table @t caption="Tab. {table}: Umsatz" pos=above
```
