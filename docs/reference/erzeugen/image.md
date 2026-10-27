---
summary: Bild aus dem Projekt (PNG, JPEG, GIF, WebP, SVG).
---
# image

Zeigt ein Bild. Der Pfad ist relativ zur Deck-Datei. Ohne `h` übernimmt das Bild sein
Seitenverhältnis.

```forme
image @chart "./img/umsatz.svg" x=120 y=260 w=900
```

Im Editor legt das Werkzeug „Bild“ (Taste I) die Datei ins Projekt nach `img/` und schreibt
diese Zeile.

## Parameter

### @id
- Typ: ID
- positional

Name des Objekts.

### pfad
- Typ: Pfad
- positional

Pfad zur Bilddatei, relativ zum Deck (`"./img/foto.jpg"`), oder eine `https://`-Adresse.

### src
- Typ: Pfad

Der Pfad als Schlüssel, z. B. `set @chart src="./img/neu.png"`.

### w
- Typ: Länge
- Standard: `400`

Breite.

### h
- Typ: Länge
- Standard: aus dem Seitenverhältnis

Höhe. Mit fester Höhe entscheidet `fit`, wie das Bild die Box füllt.

### fit
- Typ: Auswahl
- Werte: `contain`, `cover`, `fill`
- Standard: `contain`

`contain` zeigt das ganze Bild, `cover` füllt die Box und schneidet zu, `fill` verzerrt.

```forme
image @a "./img/umsatz.svg" x=120 y=300 w=520 h=400 fit=contain stroke=$muted
image @b "./img/umsatz.svg" x=700 y=300 w=520 h=400 fit=cover stroke=$muted
image @c "./img/umsatz.svg" x=1280 y=300 w=520 h=400 fit=fill stroke=$muted
```

<!-- gemeinsam: x y radius radius.tl stroke stroke.width opacity shadow.x hidden like style in within span -->

## Beispiele

### Mit Bildunterschrift

```forme
image @chart "./img/umsatz.svg" x=120 y=260 w=900 radius=16
number figure @chart caption="Abb. {figure}: Umsatz nach Region"
```
