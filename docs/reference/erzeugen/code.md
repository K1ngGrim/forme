---
summary: Quelltext mit Syntaxhervorhebung, z. B. Python, Java oder SQL.
---
# code

Zeigt Quelltext in einer Monospace-Schrift, farbig hervorgehoben nach Sprache. Der Code steht
am besten in einem Rohtext `"""…"""`: Zeilenumbrüche und Einrückung bleiben erhalten, es gibt
keine Escapes und keine `{…}`-Ausdrücke. Die gemeinsame Einrückung der Zeilen wird entfernt,
der Code darf also passend zum Block eingerückt sein.

```forme
code @beispiel lang=python x=120 y=260 """
  def quadrat(x: float) -> float:
      # Fläche eines Quadrats
      return x * x

  print(quadrat(3))
"""
```

Ohne `w` und `h` passt sich der Block dem Code an, Zeilen werden nicht umbrochen. Im PPTX-Export
bleibt Code editierbarer Text (Schrift Consolas, Farben als Textfarben).

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### inhalt
- Typ: Text
- positional

Der Quelltext, meist als Rohtext `"""…"""`. Tabulatoren werden zu vier Leerzeichen.

### lang
- Typ: Auswahl
- Werte: `python`, `java`, `sql`, `javascript`, `typescript`, `c`, `cpp`, `csharp`, `go`, `rust`, `kotlin`, `json`, `bash`, `forme`, `text`
- Standard: `text`

Sprache für die Hervorhebung. Kürzel wie `py`, `js`, `ts`, `sh`, `c++`, `cs`, `rs`, `kt`
funktionieren ebenfalls. `text` und unbekannte Sprachen bleiben einfarbig.

```forme
code @abfrage lang=sql x=120 y=260 """
  SELECT name, COUNT(*) AS auftraege
  FROM kunden k
  JOIN auftraege a ON a.kunde = k.id
  WHERE a.datum >= '2024-01-01'
  GROUP BY name
  ORDER BY auftraege DESC;
"""
```

### palette
- Typ: Auswahl
- Werte: `light`, `dark`
- Standard: `light`

Farbschema: hell (Hintergrund `#F6F8FA`) oder dunkel (Hintergrund `#282C34`). Ein Theme kann
einzelne Farben mit `color code.<art>` überschreiben, mit den Arten `plain`, `keyword`,
`string`, `comment`, `number`, `function`, `type`, `constant`, `meta`, `background` und
`lineNumber`.

```forme
color code.keyword #DC2626
color code.background #FFF7ED
---
code @java lang=java x=120 y=260 palette=dark """
  public record Punkt(int x, int y) {
      // Abstand zum Ursprung
      double betrag() { return Math.hypot(x, y); }
  }
"""
code @hell lang=java x=120 y=560 """
  @Override
  public String toString() { return "Punkt"; }
"""
```

### numbers
- Typ: Wahrheitswert
- Standard: `false`

Zeilennummern vor jeder Zeile.

```forme
code @nummeriert lang=javascript x=120 y=260 numbers=true """
  const summe = (xs) => xs.reduce((a, b) => a + b, 0);
  console.log(summe([1, 2, 3]));
"""
```

### wrap
- Typ: Wahrheitswert
- Standard: `false`

Lange Zeilen bei fester Breite `w` umbrechen. Ohne `wrap` laufen sie über den Rand hinaus.

### font
- Typ: Name
- Standard: `code` aus dem Theme, sonst eine eingebaute Monospace-Schrift

Schrift. Definiert das Theme eine Schrift `code` (z. B. `font code "JetBrains Mono"
file="./fonts/JetBrainsMono.ttf"`), wird sie für alle Code-Blöcke verwendet.

### size
- Typ: Zahl
- Standard: `28`

Schriftgröße in px.

### line
- Typ: Zahl
- Standard: `1.45`

Zeilenhöhe als Vielfaches der Schriftgröße.

### pad
- Typ: Zahl
- Standard: `32`

Innenabstand zwischen Hintergrund und Code.

### fill
- Typ: Farbe
- Standard: Hintergrund der Palette

Hintergrund des Blocks; `none` für keinen.

### color
- Typ: Farbe
- Standard: Grundfarbe der Palette

Farbe für Text ohne Hervorhebung.

### radius
- Typ: Zahl
- Standard: `16`

Eckenradius des Hintergrunds.

<!-- gemeinsam: x y w h weight radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden text like style in within span -->
