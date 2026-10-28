---
summary: Eine Komponente des Themes einsetzen, mit eigenen Parametern.
---
# use

`use` setzt eine im Theme definierte [Komponente](../theme/component.md) ein. Die Komponente
wird mit den angegebenen Parametern aufgebaut; Position und Größe kommen aus `x`, `y`, `w` und
`h`.

```forme
component kpi w=420 h=240 value="0" label="Kennzahl" {
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  text @value param.value x=40 y=40 size=88 weight=700 color=$primary
  text @label param.label x=40 y=@value.bottom+8 size=32 color=$muted
}
---
use @k1 kpi x=120 y=300 value="640" label="Aufträge"
use @k2 kpi x=600 y=300 value="98 %" label="Termintreue"
```

Beispiele mit `---` zeigen oben Theme-Code (hier die Komponente) und unten die Folie.

## Parameter

### @id
- Typ: ID
- positional

Name der Instanz.

### komponente
- Typ: Name
- positional

Name der Komponente aus dem Theme.

### w
- Typ: Länge
- Standard: `w` der Komponente

Breite der Instanz; in der Komponente als `param.w` verfügbar.

### h
- Typ: Länge
- Standard: `h` der Komponente

Höhe der Instanz (`param.h`).

### like
- Typ: ID

Übernimmt Position, Größe und alle Parameter einer anderen Instanz derselben Komponente.

### parameter
- Typ: Text | Zahl | Farbe

Jeder weitere Schlüssel ist ein Parameter der Komponente (`value="640"`), in der Komponente
als `param.value` lesbar. Nicht angegebene Parameter nehmen den Standard aus der
Komponentendefinition.

<!-- gemeinsam: x y opacity hidden span -->

## Beispiele

### Instanzen verteilen

```forme
component kpi w=420 h=240 value="0" label="Kennzahl" {
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  text @value param.value x=40 y=40 size=88 weight=700 color=$primary
  text @label param.label x=40 y=@value.bottom+8 size=32 color=$muted
}
---
use @k1 kpi x=120 y=300 value="640" label="Aufträge"
use @k2 kpi like=@k1 value="98 %" label="Termintreue"
use @k3 kpi like=@k1 value="4,2" label="Ø Bewertung"
distribute h @k1 @k2 @k3 within=content
```
