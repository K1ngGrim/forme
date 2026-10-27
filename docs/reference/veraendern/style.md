---
summary: Textstil anwenden – oder im Theme einen Textstil definieren.
---
# style

`style` hat zwei Formen. Auf einer Folie wendet `style @ziel name` einen Stil des Themes auf
Objekte an. Im Theme definiert `style name …` einen Stil.

```forme
text @t "Überschrift mit Stil" x=120 y=300
style @t h1
```

Schlüssel, die nach dem Anwenden gesetzt werden, überschreiben den Stil. Kürzer geht es beim
Erzeugen mit `style=h1`.

## Im Theme definieren

`style name [base=anderer] schlüssel=wert …` legt einen Stil an. `base=` übernimmt einen anderen
Stil und ergänzt ihn.

```forme
style marke font=heading size=96 color=$accent
style marke_klein base=marke size=48
---
text @a "Großer Stil" x=120 y=300 style=marke
text @b "Abgeleiteter Stil" x=120 y=@a.bottom+24 style=marke_klein
```

## Parameter

### @ziele
- Typ: ID
- positional

Auf der Folie: die Objekte, die den Stil bekommen.

### name
- Typ: Name
- positional
- erforderlich

Name des Stils (`h1`, `body`, …).

### base
- Typ: Name

Im Theme: Stil, dessen Werte übernommen werden.

### fill
- Typ: Farbe

Im Theme: Hintergrund für Textboxen mit diesem Stil.

### stroke
- Typ: Farbe

Im Theme: Kontur.

### stroke.width
- Typ: Zahl

Im Theme: Konturbreite.

### radius
- Typ: Zahl

Im Theme: Eckenradius.

<!-- gemeinsam: font size weight italic color line align valign pad -->
