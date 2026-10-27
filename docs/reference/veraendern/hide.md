---
summary: Objekte ausblenden; `show` blendet sie wieder ein.
aliases: show
---
# hide

Blendet Objekte aus. Sie bleiben definiert: Bezüge wie `@a.bottom` funktionieren weiter. So
lassen sich auch Objekte aus Master oder Layout auf einzelnen Folien ausblenden, etwa die
Seitenzahl.

```forme
rect @a x=200 y=300 w=600 h=400 fill=$primary
rect @b x=1000 y=300 w=600 h=400 fill=$accent
hide @a
```

## show

Blendet ausgeblendete Objekte wieder ein.

```forme
rect @a x=200 y=300 w=600 h=400 fill=$primary hidden=true
show @a
```

## Parameter

### @ziele
- Typ: ID
- positional
- erforderlich

Ein oder mehrere Objekte.

## Beispiele

### Seitenzahl auf einer Folie ausblenden

```forme
slide @a layout=content
  fill @title "Ohne Seitenzahl"
  hide @pagenum
```
