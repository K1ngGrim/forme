---
summary: Hintergrund einer Folie, eines Layouts oder Masters.
---
# background

Setzt den Hintergrund: eine Farbe, ein Bild oder beides. Im Master oder Layout gilt er für alle
Folien damit, auf einer Folie nur für diese.

```forme
slide @a layout=title
  background fill=$primary
  fill @title "Farbiger Hintergrund" color=#FFFFFF
```

## Parameter

### fill
- Typ: Farbe
- Standard: aus Master bzw. Layout

Hintergrundfarbe.

### image
- Typ: Pfad

Hintergrundbild, relativ zur Datei, in der es steht.

### fit
- Typ: Auswahl
- Werte: `cover`, `contain`, `fill`
- Standard: `cover`

Wie das Bild die Folie füllt.

```forme
slide @a layout=blank
  background fill=#0F172A image="./img/umsatz.svg" fit=contain
```
