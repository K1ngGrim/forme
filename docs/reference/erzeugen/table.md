---
summary: Tabelle mit Kopfzeile, Spaltenverhältnissen und Rich Text in den Zellen.
---
# table

Eine Tabelle besteht aus eingerückten `row`-Zeilen; jedes Positionsargument ist eine Zelle. Die
erste Zeile ist die Kopfzeile. Die Höhe ergibt sich aus dem Inhalt.

```forme
table @t x=120 y=280 w=1680 cols="2,1,1"
  row "Bereich" "2025" "2026"
  row "Vertrieb" "1,1 Mio €" "1,4 Mio €"
  row "Service" "0,6 Mio €" "0,7 Mio €"
```

Innerhalb einer Tabelle ist `row` eine Tabellenzeile, kein [Layout-Container](../layout/row.md).

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### w
- Typ: Länge
- Standard: `800`

Breite der Tabelle.

### cols
- Typ: Text
- Standard: gleich breite Spalten

Spaltenverhältnis, z. B. `"2,1,1"`: die erste Spalte doppelt so breit wie die anderen.

### header
- Typ: Wahrheitswert
- Standard: `true`

Erste Zeile als Kopfzeile hervorheben.

### header.fill
- Typ: Farbe
- Standard: `#F3F4F6`

Hintergrund der Kopfzeile.

### header.color
- Typ: Farbe

Textfarbe der Kopfzeile.

### border
- Typ: Farbe
- Standard: `#D1D5DB`

Farbe der Linien.

### stripe
- Typ: Farbe

Hintergrund jeder zweiten Zeile (Zebrastreifen).

### fill
- Typ: Farbe

Hintergrund aller Zellen.

### size
- Typ: Zahl
- Standard: `24`

Schriftgröße.

### pad
- Typ: Zahl
- Standard: `16`

Innenabstand der Zellen.

### line
- Typ: Zahl
- Standard: `1.3`

Zeilenhöhe in den Zellen.

<!-- gemeinsam: x y font color opacity hidden like style in within span -->

## Beispiele

### Farbige Kopfzeile und Streifen

```forme
table @t x=120 y=280 w=1680 cols="2,1,1" size=32 header.fill=$primary header.color=#FFFFFF stripe=#F9FAFB
  row "Kennzahl" "Ist" "Ziel"
  row "Aufträge" "640" "600"
  row "Termintreue" "**98 %**" "95 %"
  row "Bewertung" "4,2" "4,0"
```

### Ohne Kopfzeile

```forme
table @t x=120 y=280 w=1200 header=false size=32
  row "Ort" "Raum 2.14"
  row "Zeit" "14:00 Uhr"
```
