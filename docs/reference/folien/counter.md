---
summary: Eigenen Zähler anlegen.
---
# counter

Legt einen Zähler an, im Theme oder auf oberster Ebene des Decks. Er wird mit
[`number`](number.md) erhöht und in Texten als `{name}` eingesetzt.

```forme
deck "Mit Zähler"
counter beispiel start=0

slide @a layout=content {
  fill @title "Beispiele"
  text @t1 "Beispiel" x=120 y=300 size=48
  number beispiel @t1 caption="Beispiel {beispiel}"
  text @t2 "Noch eins" x=120 y=500 size=48
  number beispiel @t2 caption="Beispiel {beispiel}"
}
```

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name des Zählers.

### start
- Typ: Zahl
- Standard: `0`

Startwert; die erste Nummerierung ergibt `start + 1`.
