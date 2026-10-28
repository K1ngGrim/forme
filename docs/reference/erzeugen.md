---
summary: Objekte anlegen – Formen, Linien, Text, Listen, Bilder, Tabellen, Gruppen und Komponenten.
ops: rect ellipse line arrow polygon path text code math list item image table group use
---
# Erzeugen

Erzeugungs-Operationen legen ein Objekt auf der Folie an. Das erste Argument ist die ID
(`@name`), über die das Objekt später verändert, ausgerichtet oder referenziert wird. Fehlt sie,
vergibt Forme intern eine; der Editor schreibt immer eine sichtbare ID wie `@rect3`.

```forme
rect @hintergrund x=120 y=260 w=1680 h=560 radius=40 fill=#EEF2FF
ellipse @punkt x=200 y=340 w=160 h=160 fill=$primary
text @titel "Objekte entstehen von oben nach unten" x=@punkt.right+48 y=@punkt.cy-30 size=56
```

Objekte werden in der Reihenfolge der Zeilen gezeichnet: Was später erzeugt wird, liegt weiter
oben. Die Reihenfolge lässt sich mit [`z`](veraendern/z.md) ändern. Ein Objekt kann sich nur auf
Objekte beziehen, die vorher definiert wurden.
