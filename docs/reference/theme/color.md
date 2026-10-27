---
summary: Benannte Farbe, als `$name` verwendbar.
---
# color

Definiert eine Farbe des Themes. Sie wird wie ein Token mit `$name` verwendet und erscheint im
Editor in der Farbauswahl.

```forme
color marke #7C3AED
color marke.hell #EDE9FE
---
rect @flaeche x=120 y=280 w=1680 h=520 radius=32 fill=$marke.hell
text @t "Markenfarbe" x=200 y=360 size=96 weight=700 color=$marke
```

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name der Farbe.

### farbe
- Typ: Farbe
- positional
- erforderlich

`#RRGGBB`, `#RGB`, `#RRGGBBAA`, `rgb(…)` oder `rgba(…)`.
