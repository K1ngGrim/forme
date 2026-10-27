---
summary: Gemeinsamer Hintergrund und Elemente für alle Folien eines Layouts.
---
# master

Ein Master enthält, was auf vielen Folien gleich ist: Hintergrund, Logo, Fußzeile, Seitenzahl.
Layouts bauen auf einem Master auf (`layout … master=default`). Ein Theme kann mehrere Master
haben, z. B. einen ohne Fußzeile für Titelfolien.

```forme
master streifen
  background fill=#FFFFFF
  rect @band x=0 y=1000 w=slide.w h=80 fill=$primary
  text @fuss "{deck.title} · {slide.n}" x=60 y=1022 size=24 color=#FFFFFF
layout mitstreifen master=streifen
  slot @title style=h2 x=120 y=120 w=1680
---
slide @a layout=mitstreifen
  fill @title "Folie mit eigenem Master"
```

Objekte des Masters lassen sich auf einer Folie mit `set` ändern und mit `hide` ausblenden.

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name des Masters. `default` wird verwendet, wenn ein Layout keinen Master nennt.
