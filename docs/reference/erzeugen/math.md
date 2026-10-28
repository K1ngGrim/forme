---
summary: Formel in LaTeX-Schreibweise, gesetzt mit MathJax.
---
# math

Setzt eine Formel in LaTeX-Schreibweise. Die Formel steht als Rohtext in `"""…"""`, damit
Backslashes und geschweifte Klammern zu TeX gehören (in einer normalen Zeichenkette wären sie
Escapes bzw. `{…}`-Ausdrücke; dafür gibt es eine Warnung).

```forme
math @mittelwert x=120 y=300 size=72 """\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i"""
```

Gesetzt wird mit [MathJax](https://www.mathjax.org/) (TeX-Eingabe, SVG-Ausgabe) überall gleich:
im Editor, in der CLI, in VS Code und in der Dokumentation. Verfügbar sind die TeX-Grundbefehle
sowie die Pakete `ams` (Umgebungen wie `pmatrix`, `aligned`, `cases`), `boldsymbol`, `braket`,
`cancel`, `color`, `newcommand` und `textmacros`. Fehler in der Formel erscheinen als
Fehlermeldung an der Formel.

Die Formel ist ein Objekt wie jedes andere: verschieben, `align`, `like=`, in Containern. Im
PPTX-Export wird sie als Bild eingefügt (im Export-Log vermerkt), weil PowerPoint MathJax-Ausgabe
nicht als editierbare Formel übernehmen kann.

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### formel
- Typ: Text
- positional

Die Formel in LaTeX-Schreibweise, als Rohtext `"""…"""`. Mehrzeilig möglich, z. B. für
`aligned`.

```forme
math @gleichungen x=120 y=280 size=56 """
  \begin{aligned}
    f(x) &= (x+1)^2 \\
         &= x^2 + 2x + 1
  \end{aligned}
"""
```

### size
- Typ: Zahl
- Standard: `48`

Schriftgröße in px; die Formel wird entsprechend skaliert.

### color
- Typ: Farbe
- Standard: `#111827`

Farbe der Formel. Einzelne Teile färbt `\color{red}{…}`.

```forme
math @euler x=120 y=300 size=96 color=$primary """e^{i\pi} + 1 = 0"""
math @teil x=120 y=520 size=64 """a^2 + \color{#DC2626}{b^2} = c^2"""
```

### display
- Typ: Wahrheitswert
- Standard: `true`

Abgesetzte Formel (große Brüche und Summen mit Grenzen darüber und darunter). Mit `false` wird
wie im Fließtext gesetzt, kompakter.

```forme
math @abgesetzt x=120 y=280 size=56 """\sum_{k=1}^{n} k = \frac{n(n+1)}{2}"""
math @kompakt x=120 y=560 size=56 display=false """\sum_{k=1}^{n} k = \frac{n(n+1)}{2}"""
```

### w, h
- Typ: Länge
- Standard: Größe der gesetzten Formel

Feste Größe: Die Formel wird in die Box eingepasst (Seitenverhältnis bleibt, zentriert).

<!-- gemeinsam: x y opacity shadow.x hidden text like style in within span -->

## Beispiele

### Matrix

```forme
math @matrix x=120 y=280 size=60 """
  A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}, \quad \det A = ad - bc
"""
```

### Formel in einer Karte

```forme
box @karte x=120 y=260 w=900 fill=$surface radius=24 pad=48 {
  text @name "Normalverteilung" size=40 weight=700
  math @dichte y=80 size=48 """f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}"""
}
```
