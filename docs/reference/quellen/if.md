---
summary: Einen Block nur auswerten, wenn eine Bedingung zutrifft.
---
# if

Wertet die Operationen im Block nur aus, wenn die Bedingung zutrifft: eine Zahl ungleich 0,
ein nicht leerer Text oder `true`. Typisch ist `if slide.refs`: Quellenangaben erscheinen nur auf
Folien, die etwas zitieren (`slide.refs` ist die Anzahl der Quellen der Folie).

```forme
master default {
  background fill=#FFFFFF
  if slide.refs {
    text @quellen_titel "Quellen" style=caption x=$margin y=960
  }
}
---
slide @a layout=content {
  fill @title "Mit Zitat"
  text @t "Siehe @knuth1984." x=120 y=300 size=40
}
slide @b layout=content {
  fill @title "Ohne Zitat"
}
```

## Parameter

### bedingung
- Typ: Ausdruck
- positional
- erforderlich

Zum Beispiel `slide.refs`, `deck.refs`, `ref.doi` (in `for`: nur wenn die Quelle eine DOI hat)
oder ein Token.
