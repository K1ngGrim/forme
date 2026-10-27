# Gemeinsame Parameter

Diese Parameter gelten für viele Operationen. Die Referenzseiten binden sie mit
`<!-- gemeinsam: … -->` ein; eine Seite kann einen Parameter mit eigener Beschreibung
überschreiben (z. B. andere Standardwerte).

### x
- Typ: Länge
- Standard: `0`

Horizontale Position der linken Kante in Pixeln. Bezugspunkt ist die linke Folienkante, in
Gruppen und Containern die linke Kante des Elternobjekts. Prozentwerte beziehen sich auf die
Folienbreite, Ausdrücke wie `@titel.right+40` oder `content.x` sind erlaubt.

### y
- Typ: Länge
- Standard: `0`

Vertikale Position der oberen Kante. Prozentwerte beziehen sich auf die Folienhöhe.

### w
- Typ: Länge

Breite in Pixeln oder Prozent der Folienbreite.

### h
- Typ: Länge

Höhe in Pixeln oder Prozent der Folienhöhe.

### fill
- Typ: Farbe

Füllfarbe: `#RRGGBB`, `#RGB`, `#RRGGBBAA`, `rgba(…)`, ein Theme-Token wie `$primary` oder
`none` für keine Füllung.

### stroke
- Typ: Farbe
- Standard: keine Kontur

Farbe der Kontur. Die Breite kommt aus `stroke.width`.

### stroke.width
- Typ: Zahl
- Standard: `2`

Breite der Kontur in Pixeln.

### stroke.dash
- Typ: Zahl
- Standard: `0` (durchgezogen)

Länge der Striche und Lücken einer gestrichelten Kontur.

### opacity
- Typ: Zahl
- Standard: `1`

Deckkraft zwischen `0` (unsichtbar) und `1`.

### shadow.x, shadow.y, shadow.blur, shadow.color
- Typ: Zahl | Farbe
- Standard: `shadow.x=0 shadow.y=8 shadow.blur=24 shadow.color=rgba(0,0,0,0.25)`

Schlagschatten. Sobald einer der Werte gesetzt ist, wird der Schatten gezeichnet; fehlende Werte
nehmen den Standard. `shadow=none` entfernt ihn. Kürzer geht es mit der Operation
[`shadow`](veraendern/shadow.md).

```forme
rect @karte x=560 y=300 w=800 h=420 radius=32 fill=#FFFFFF shadow.y=16 shadow.blur=48
```

### hidden
- Typ: Wahrheitswert
- Standard: `false`

`true` blendet das Objekt aus. Es bleibt definiert und kann weiter referenziert werden.

### radius
- Typ: Zahl
- Standard: `0`

Eckenradius für alle vier Ecken.

### radius.tl, radius.tr, radius.br, radius.bl
- Typ: Zahl

Eckenradius einzelner Ecken: oben links, oben rechts, unten rechts, unten links.

### like
- Typ: ID

Übernimmt alle gesetzten Eigenschaften eines vorher definierten Objekts. Danach folgende
Schlüssel überschreiben einzelne Werte.

```forme
rect @a x=120 y=300 w=480 h=320 radius=24 fill=$primary
rect @b like=@a x=720
rect @c like=@b x=1320 fill=$accent
```

### style
- Typ: Stil

Wendet einen Textstil des Themes an (`h1`, `body`, …). Schlüssel, die danach in derselben Zeile
stehen, überschreiben den Stil.

### in
- Typ: ID

Setzt die Box auf die eines anderen Objekts. Bei Text wird `pad` zum Innenabstand.

```forme
rect @karte x=120 y=300 w=720 h=400 radius=32 fill=#EEF2FF
text @label "Text in der Karte" in=@karte pad=48 size=48
```

### within
- Typ: Region | ID

Setzt Position und Größe auf eine Region des Layouts (`content`, `col1`, `slide`) oder auf ein
Objekt.

### span
- Typ: Zahl
- Standard: `1`

Nur in [`row`](layout/row.md) und [`column`](layout/column.md): Anteil am freien Platz bzw. Anzahl
der Spalten im `cols`-Raster.

### font
- Typ: Name

Schrift aus dem Theme (`font heading "Inter" …`). Ohne Angabe gilt die Schrift des Stils bzw.
Inter.

### size
- Typ: Zahl
- Standard: `32`

Schriftgröße in Pixeln.

### weight
- Typ: Zahl
- Standard: Gewicht der Schrift, sonst `400`

Schriftstärke, z. B. `400` (normal) oder `700` (fett).

### italic
- Typ: Wahrheitswert
- Standard: `false`

Kursivschrift für den ganzen Text. Einzelne Wörter: `*kursiv*` im Text.

### color
- Typ: Farbe
- Standard: `#111827`

Textfarbe.

### line
- Typ: Zahl
- Standard: `1.25`

Zeilenhöhe als Vielfaches der Schriftgröße.

### align
- Typ: Auswahl
- Werte: `left`, `center`, `right`
- Standard: `left`

Ausrichtung der Zeilen innerhalb der Textbox.

### valign
- Typ: Auswahl
- Werte: `top`, `middle`, `bottom`
- Standard: `top`

Vertikale Ausrichtung. Wirkt nur bei fester Höhe `h`.

### anchor
- Typ: Auswahl
- Werte: `left`, `center`, `right`
- Standard: `left`

Bezugspunkt für `x`: linke Kante, Mitte oder rechte Kante der Textbox. Praktisch für
Seitenzahlen am rechten Rand.

### pad
- Typ: Zahl
- Standard: `0`

Innenabstand zwischen Rand und Text, sichtbar zusammen mit `fill`.

### text
- Typ: Text

Der Textinhalt als Schlüssel, z. B. `set @titel text="Neu"`. Bei `text` und `fill` steht er
normalerweise als Positionsargument.
