---
summary: Platzhalter in einem Layout, auf der Folie mit `fill` befüllt.
---
# slot

Ein Platzhalter im Layout ist eine Textbox (oder ein Bildfeld), die jede Folie mit
[`fill`](../folien/fill.md) befüllt. Leere Platzhalter zeigt nur der Editor. Beim PPTX-Export
werden Platzhalter zu PowerPoint-Platzhaltern.

```forme
layout karte master=default
  slot @title style=h2 x=120 y=120 w=1680 placeholder="Folientitel"
  slot @bild kind=image x=120 y=300 w=900 h=600
---
slide @a layout=karte
  fill @title "Platzhalter für Text und Bild"
  fill @bild "./img/umsatz.svg"
```

Andere Objekte im Layout können sich auf den befüllten Inhalt beziehen
(`y=@title.bottom+24`): Platzhalter werden schon beim Anlegen mit dem Inhalt der Folie gefüllt.

## Parameter

### @id
- Typ: ID
- positional
- erforderlich

Name des Platzhalters; die Folie befüllt ihn mit `fill @id`.

### kind
- Typ: Auswahl
- Werte: `text`, `image`
- Standard: `text`

Text- oder Bildplatzhalter.

### placeholder
- Typ: Text

Hinweistext, den der Editor im leeren Platzhalter zeigt.

### src
- Typ: Pfad

Bei `kind=image`: Standardbild.

### fit
- Typ: Auswahl
- Werte: `contain`, `cover`, `fill`
- Standard: `contain`

Bei `kind=image`: wie das Bild die Box füllt.

### bullet
- Typ: Auswahl
- Werte: `disc`, `dash`, `number`, `none`

Aufzählungszeichen, falls der Inhalt eine Liste ist.

<!-- gemeinsam: x y w h size weight italic color font line align valign anchor pad fill radius radius.tl stroke stroke.width stroke.dash opacity shadow.x hidden text like style in within span -->
