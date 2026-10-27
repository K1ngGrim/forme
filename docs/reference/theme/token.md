---
summary: Benannter Wert (Abstand, Größe, Text), als `$name` verwendbar.
---
# token

Ein Token ist ein benannter Wert. Überall, wo ein Wert stehen kann, setzt `$name` ihn ein. So
bleiben Abstände und Größen an einer Stelle änderbar.

```forme
token rand 200
token abstand 48
---
rect @a x=$rand y=300 w=600 h=300 fill=$primary
rect @b x=@a.right+$abstand y=300 w=600 h=300 fill=$accent
```

Namen dürfen Punkte enthalten (`$space.l`). Tokens können andere Tokens verwenden:
`token content.w (slide.w-2*$margin)`.

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name, mit dem `$name` den Wert einsetzt.

### wert
- Typ: Länge | Zahl | Text | Ausdruck
- positional
- erforderlich

Der Wert; Ausdrücke in Klammern.
