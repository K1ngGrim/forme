# Forme – Guide: Folien und Themes erstellen

Dieser Guide ist für Menschen **und** für KI-Assistenten gedacht. Er erklärt, wie man mit Forme
Präsentationen schreibt, Themes baut und den Editor nutzt. Die vollständige, verbindliche
Referenz aller Operationen steht in [`language.md`](language.md); dieser Guide zeigt, *wie man
sie einsetzt*.

**Für KI-Assistenten:** Lies zuerst Abschnitt [10](#10-regeln-für-ki-assistenten). Dort stehen
die Regeln und das Antwortformat. Alle Beispiele hier sind mit dem echten Compiler geprüft.
Die vollständigen Beispiele liegen in [`examples/guide/`](../examples/guide/).

---

## Inhalt

1. [Das Prinzip in drei Sätzen](#1-das-prinzip-in-drei-sätzen)
2. [Schnellstart](#2-schnellstart)
3. [Die Sprache in fünf Minuten](#3-die-sprache-in-fünf-minuten)
4. [Folien bauen – Rezepte](#4-folien-bauen--rezepte)
5. [Positionieren und Anordnen](#5-positionieren-und-anordnen)
6. [Ein eigenes Theme bauen](#6-ein-eigenes-theme-bauen)
7. [Die mitgelieferten Vorlagen](#7-die-mitgelieferten-vorlagen)
8. [Arbeiten im Editor](#8-arbeiten-im-editor)
9. [Export](#9-export)
10. [Regeln für KI-Assistenten](#10-regeln-für-ki-assistenten)
11. [Fallstricke und Fehlermeldungen](#11-fallstricke-und-fehlermeldungen)
12. [Spickzettel](#12-spickzettel)

---

## 1. Das Prinzip in drei Sätzen

- Eine Präsentation ist eine **Textdatei** (`deck.forme`). Jede Folie ist eine Liste von
  Operationen, die **von oben nach unten** ausgeführt werden.
- Das Aussehen (Farben, Schriften, Textstile, Hintergründe, Platzhalter) steht in einer
  **Theme-Datei** (`theme.forme`), die ebenfalls nur aus Operationen besteht.
- Der Editor zeigt Code und Folie nebeneinander. Was du auf der Folie verschiebst, wird als
  kleine Änderung in den Code geschrieben, und umgekehrt.

## 2. Schnellstart

**In der App:** den Editor öffnen (auf GitHub Pages oder lokal mit `pnpm dev`), im Startdialog eine Vorlage wählen (z. B. „Leere
Präsentation“), links im Code tippen oder rechts auf der Folie arbeiten.

**Kleinstes vollständiges Deck** (nutzt das eingebaute Standard-Theme):

```
deck "Meine Präsentation"

slide @start layout=title {
  fill @title "Hallo Forme"
  fill @subtitle "Mein erster Vortrag"
}

slide @inhalt layout=content {
  fill @title "Worum es geht"
  list @punkte x=120 y=260 w=1200 {
    item "Erster Punkt"
    item "Zweiter Punkt"
    item "Unterpunkt" level=2
  }
}
```

**Ohne UI prüfen und rendern:**

```
forme check deck.forme             # nur Fehler/Warnungen (--json für Werkzeuge)
forme compile deck.forme           # deck.pdf; oder: forme compile deck.forme deck.pptx
forme watch deck.forme             # bei jeder Änderung an Deck, Theme, Schriften, Bildern neu
forme init mein-vortrag -t guide   # neues Projekt aus einer Vorlage (forme templates)
```

**Projektordner:** Ein Projekt ist ein Ordner. Pfade in den Dateien sind relativ zur Datei,
in der sie stehen (Bilder relativ zum Deck, Schriften relativ zum Theme):

```
mein-vortrag/
  deck.forme
  themes/mein-theme.forme
  fonts/inter-latin-400-normal.woff
  img/diagramm.png
```

## 3. Die Sprache in fünf Minuten

### Zeilenaufbau

```
<verb> [@id] [Positionsargumente] [key=value ...]   // Kommentar
```

- **Eine Operation pro Zeile.** Blöcke (Inhalt einer Folie, Listen-Items, Tabellenzeilen,
  Gruppen) stehen in **geschweiften Klammern**: `{` am Zeilenende, `}` in einer eigenen Zeile.
  Einrückung ist nur Formatierung (üblich: 2 Leerzeichen).
- **IDs** beginnen mit `@`, nur Buchstaben, Ziffern und `_`: `@titel`, `@card_1`.
  Keine Punkte oder Bindestriche in IDs.
- **Werte ohne Leerzeichen** stehen direkt (`y=@title.bottom+24`), **mit Leerzeichen in
  Klammern** (`w=(slide.w - 2*$margin)`).
- **Zeichenketten** in `"…"`, Escapes `\"`, `\n` (Zeilenumbruch).

### Werte

| Art | Beispiel | Hinweis |
| --- | --- | --- |
| Zahl | `120`, `1.5` | Pixel, Folie ist standardmäßig 1920×1080 |
| Prozent | `10%` | bei `x`, `w`, `x2` von der Breite, sonst von der Höhe |
| Farbe | `#0F766E`, `#fff`, `rgba(0,0,0,0.3)` | |
| Token | `$primary`, `$margin` | aus dem Theme |
| Bezug | `@box.right`, `@title.bottom` | nur auf **vorher** definierte Objekte |
| Folie/Deck | `slide.w`, `slide.h`, `slide.n`, `deck.total`, `deck.title` | |
| Region | `content.x`, `col2.w` | aus dem Layout |
| Rechnung | `(slide.w - 2*$margin)`, `@a.right+40` | `+ - * /`, `min() max() round()` |

Bezüge auf Objekte: `x y w h left right top bottom cx cy center middle`.
`center` meint bei `x=` die horizontale, bei `y=` die vertikale Mitte.

### Text-Markup

```
text @t "Ein **fetter**, ein *kursiver* und ein [farbiger](#DC2626) Teil.\nZweite Zeile mit [Link](https://example.org)." x=120 y=260 w=900
```

Platzhalter in Zeichenketten: `"Folie {slide.n} von {deck.total}"`, `"{section}"`,
`"Abb. {figure}"`.

### Reihenfolge ist Bedeutung

Operationen laufen von oben nach unten. Eine Zeile sieht nur, was vorher entstanden ist:

```
rect @a x=100 y=100 w=300 h=200
rect @b x=@a.right+40 y=@a.y w=300 h=200    // ok: @a existiert schon
rect @c x=@d.right                          // FEHLER: @d kommt erst später
```

Was später kommt, überschreibt Früheres (`set`, `align`, `move` …). Was später *erzeugt* wird,
liegt weiter oben (Zeichenreihenfolge).

## 4. Folien bauen – Rezepte

Alle Rezepte sind in [`examples/guide/rezepte.forme`](../examples/guide/rezepte.forme) zusammengefasst.

### Folie mit Layout und Platzhaltern

```
slide @kpis layout=content {        // Layout aus dem Theme
  fill @title "Kennzahlen"        // Platzhalter (slot) des Layouts befüllen
}
```

Welche Platzhalter es gibt, bestimmt das Layout im Theme (Standard-Theme: `title` hat
`@title` und `@subtitle`, `content` hat `@title` und die Region `content`, `blank` ist leer).
Ein `fill` kann auch Eigenschaften überschreiben: `fill @title "Text" color=#DC2626`.

### Text

```
text @t1 "Freie Breite, kein Umbruch" x=120 y=260 size=32
text @t2 "Mit w wird umgebrochen" x=120 y=320 w=600 style=body
text @t3 "Rechtsbündig an der Kante" x=(slide.w-120) y=260 anchor=right
text @t4 "Mittig in der Box" x=1100 y=400 w=600 h=200 align=center valign=middle fill=#F3F4F6 radius=16 pad=24
```

- Ohne `w`: Breite passt sich dem Text an. Mit `w`: Umbruch.
- Ohne `h`: Höhe passt sich an. `valign` wirkt nur mit festem `h`.
- `style=h1` übernimmt Schrift, Größe, Farbe aus dem Theme. Einzelne Schlüssel danach
  überschreiben den Stil (`style=h1 color=#FFF`).

### Listen

```
list @agenda x=content.x y=content.y w=1100 style=body bullet=number {
  item "Ausgangslage"
  item "Ergebnisse"
  item "Kennzahlen" level=2
  item "Nächste Schritte"
}
```

`bullet=disc|dash|number|none`, `level=2` rückt ein.

### Tabellen

```
table @t x=120 y=500 w=1680 style=table cols="2,1,1" {
  row "Bereich" "2025" "2026"
  row "Vertrieb" "1,1 Mio €" "1,4 Mio €"
  row "Service" "0,6 Mio €" "0,7 Mio €"
}
```

Erste Zeile ist die Kopfzeile (`header=false` schaltet ab). `cols` = Spaltenverhältnis.
Weitere Schlüssel: `header.fill`, `header.color`, `border`, `stripe`, `pad`, `size`.

### Bilder

```
image @chart "./img/umsatz.svg" x=120 y=240 w=900 fit=contain radius=12
```

Ohne `h` wird das Seitenverhältnis des Bildes übernommen. `fit=contain|cover|fill`.
Im Editor: Werkzeug „Bild“ (Taste I) kopiert das Bild ins Projekt nach `img/`.

### Formen, Linien, Pfeile

```
rect @r x=120 y=120 w=400 h=240 radius=24 fill=$primary
round @r tl=0                                   // einzelne Ecke
stroke @r #111827 4 dash=12                     // Kontur
shadow @r y=12 blur=32                          // Schatten
ellipse @e x=@r.right+60 y=@r.y w=240 h=240 fill=$accent opacity=0.8
line @l x=120 y=500 x2=800 y2=500 stroke=$muted stroke.width=4
arrow @a x=120 y=580 x2=800 y2=700 head=both stroke=$primary stroke.width=6
polygon @dreieck points="0,100 60,0 120,100" x=1000 y=120 w=240 h=200 fill=#10B981
path @welle d="M0 50 C 50 0 100 0 150 50 S 250 100 300 50" x=1000 y=420 w=600 h=120 fill=none stroke=$primary stroke.width=6
```

`polygon`/`path` werden auf `w`/`h` skaliert, die Koordinaten in `points`/`d` sind relativ.

### Gruppen

```
group @logo x=1500 y=80 {
  ellipse @kreis w=80 h=80 fill=$primary
  text @kuerzel "AB" x=@kreis.right+16 y=16 size=40 weight=700
}
```

Koordinaten **und Bezüge** in einer Gruppe sind relativ zur Gruppe. Verschiebt man die Gruppe,
wandert alles mit.

### Komponenten verwenden

Komponenten sind Bausteine aus dem Theme (siehe [6.7](#67-komponenten)):

```
use @c1 card x=col1.x y=col1.y w=col1.w h=400 title="Schneller" body="Durchlaufzeit **−30 %**."
use @c2 card like=@c1 title="Günstiger" body="Kosten je Vorgang gesenkt."
use @c3 card like=@c1 title="Zufriedener" body="NPS von 31 auf 48."
distribute h @c1 @c2 @c3 within=content
```

`like=@c1` übernimmt Position, Größe und Parameter; explizite Werte gewinnen.

### Nummerieren, Abschnitte, Seitenzahlen

```
section "Zahlen"                    // auf oberster Ebene, gilt für alle folgenden Folien

slide @zahlen layout=content {
  fill @title "Kennzahlen"
  image @chart "./img/umsatz.svg" x=120 y=240 w=900
  number figure @chart caption="Abb. {figure}: Umsatz nach Bereich"
}
```

- `number figure @x caption="…"` zählt `figure` hoch und legt eine Beschriftung `@x_caption`
  unter das Objekt (`pos=above` für darüber). Zähler laufen über das ganze Deck.
- Eigene Zähler: `counter schritt` (Deck oder Theme), dann `number schritt` und `{schritt}`.
- In Texten: `{slide.n}`, `{deck.total}`, `{section}`, `{section.n}`, `{deck.sections}`.

### Notizen, ausgeblendete Folien, Hintergrund

```
slide @backup layout=content hidden=true {    // wird nicht gezeigt, nicht gezählt, nicht exportiert
  notes "Nur falls jemand nachfragt."       // Sprechernotiz (auch im PPTX)
  background fill=#0F172A                   // oder image="./img/bg.jpg" fit=cover
}
```

### Objekte aus Master/Layout ändern

```
slide @frei layout=content {
  hide @pagenum                     // ausblenden
  set @footer text="Eigener Fußtext"
  set @title color=#DC2626 y=140    // Platzhalter verschieben/umfärben
}
```

Die Theme-Datei bleibt dabei unverändert; die Änderung gilt nur für diese Folie.

### Ebenen

```
z @chart back        // front | back | forward | backward | <Index>
```

## 5. Positionieren und Anordnen

**Absolut:** `x=120 y=260`. **Relativ zur Folie:** `x=10% w=35%`.
**Relativ zu anderen Objekten:** `x=@box.right+40 y=@box.cy`.

**Regionen** aus dem Layout benutzen statt Zahlen zu raten:

```
list @l x=content.x y=content.y w=content.w
```

**In eine Box setzen:** `text @label "Titel" in=@box pad=48 valign=middle align=center`
setzt die Text-Box auf die Box von `@box`; `pad` wird zum Innenabstand.

**Kopieren:** `rect @b like=@a` übernimmt alle Eigenschaften von `@a`.

**Semantische Anordnung** (wird bei jeder Änderung neu berechnet):

```
align top @a @b @c                        // left center right top middle bottom, optional to=slide|first|<region>
distribute h @a @b @c within=content      // gleichmäßig verteilen (Reihenfolge = Argumente)
stack v @a @b @c gap=24 x=120 y=260       // untereinander (h = nebeneinander)
grid @g1 @g2 @g3 @g4 cols=2 gap=32 within=content rowh=280
```

**Verschieben relativ:** `move @a 40 0` (dx, dy).

### Layout-Container: Zeilen und Spalten (wie Bootstrap)

Für Folien mit mehreren Inhaltsblöcken sind `row` und `column` meist die beste Wahl: Inhalt
wird automatisch angeordnet, und Container lassen sich verschachteln.

```
row @haupt within=content gap=$gap {
  column @links span=2 gap=32 {
    text @lead "Container ordnen ihren Inhalt automatisch an." style=body
    row @kpis gap=24 {
      use @k4 kpi value="640" label="Aufträge"
      use @k5 kpi value="98 %" label="Termintreue"
      use @k6 kpi value="4,2" label="Ø Bewertung"
    }
  }
  column @seite fill=$surface radius=24 pad=40 gap=16 {
    text @seite_titel "Seitenleiste" style=h2
    text @seite_text "Ein Drittel der Breite, eigener Hintergrund." style=body
  }
}
```

- **`row`** legt Kinder nebeneinander. Kinder ohne `w` teilen sich die Breite; `span=2`
  bekommt doppelt so viel. Mit `cols=12` wird daraus ein echtes 12-Spalten-Raster:
  `span=4` = ein Drittel, Überlauf bricht in die nächste Zeile um.
- **`column`** legt Kinder untereinander und gibt ihnen die volle Breite. Text bricht
  automatisch um.
- **Content-Block** = Container mit `fill`, `radius`, `pad` (Innenabstand), optional
  `shadow.*`.
- `gap` = Abstand, `align` = Querachse (`stretch` Standard, `start`, `center`, `end`),
  `justify` = Hauptachse (`start`, `center`, `end`, `between`, `around`).
- Ohne `w`/`h` wächst ein Container mit seinem Inhalt; mit `within=content` füllt er die
  Region.
- Im Editor: Kind ziehen = Reihenfolge ändern, Pfeiltasten = eine Position weiter,
  Größe ziehen = feste Größe (`w=`), die Geschwister passen sich an.

Faustregel: Für Layouts, die sich anpassen sollen, Regionen, Bezüge und `distribute`/`stack`
nutzen. Für einzelne, frei platzierte Objekte reichen Zahlen.

## 6. Ein eigenes Theme bauen

Ein Theme ist eine normale Forme-Datei, die mit `theme "Name"` beginnt. Das vollständige
Beispiel steht in [`examples/guide/themes/mein-theme.forme`](../examples/guide/themes/mein-theme.forme),
das passende Deck in [`examples/guide/deck.forme`](../examples/guide/deck.forme).
Eingebunden wird es im Deck mit `theme "./themes/mein-theme.forme"`.

Empfohlene Reihenfolge im Theme: Kopf → Farben → Maße → Schriften → Stile → Komponenten →
Master → Layouts.

### 6.1 Kopf, Farben, Maße

```
theme "Mein Theme"
size 1920x1080

color primary #0F766E
color accent #F59E0B
color ink #0F172A
color text #334155
color muted #64748B
color surface #F1F5F9
color line #CBD5E1

token margin 120
token gap 40
token content.y 260
token content.w (slide.w-2*$margin)
```

- `color` und `token` sind beide über `$name` nutzbar. Tokens dürfen rechnen und andere Tokens
  verwenden.
- Namen mit Punkt gehen (`content.w`, `space.l`); der Teil nach dem Punkt darf **nicht mit
  einer Ziffer** beginnen (`ring.1` geht nicht, `ring1` schon).

### 6.2 Schriften

```
font heading "Inter" weight=700 file="./fonts/inter-latin-700-normal.woff"
font body "Inter" weight=400 file="./fonts/inter-latin-400-normal.woff"
font body.italic "Inter" weight=400 italic=true file="./fonts/inter-latin-400-italic.woff"
```

- Mit `file=` (woff, ttf, otf; **kein woff2**) misst Forme Text exakt und bettet die Schrift
  ins PDF ein. Ohne `file=` nimmt der Browser eine installierte Schrift, Umbrüche sind dann
  nur angenähert.
- Für kursiven/fetten Text die passenden Schnitte ebenfalls als `font` angeben, sonst
  simuliert der Browser sie.
- Freie Schriften (SIL OFL) wie Inter oder Roboto gibt es z. B. über `@fontsource/*` (npm).

### 6.3 Textstile

```
style title font=heading size=88 color=$ink line=1.1
style h1 font=heading size=60 color=$ink line=1.15
style h2 font=heading size=40 color=$primary line=1.2
style body font=body size=32 color=$text line=1.45
style small font=body size=24 color=$muted line=1.4
style caption font=body size=22 color=$muted
style footer font=body size=20 color=$muted
style table font=body size=26 color=$text pad=16 border=$line header.fill=$primary header.color=#FFFFFF stripe=$surface
```

- `style name base=anderer …` erbt von einem anderen Stil.
- Stile dürfen beliebige Eigenschaften enthalten (auch `fill`, `radius`, `pad`), z. B. für
  Etiketten: `style badge font=heading size=28 color=#FFFFFF fill=$primary radius=24 pad=12`.
- Der Stil `caption` wird automatisch für `number … caption=` verwendet (sonst `footer`).

### 6.4 Master

Der Master enthält, was auf (fast) jeder Folie liegt: Hintergrund, Logo, Fußzeile, Seitenzahl.

```
master default {
  background fill=#FFFFFF
  rect @accentbar x=0 y=0 w=slide.w h=12 fill=$primary
  text @footer "{deck.title} · {section}" style=footer x=$margin y=(slide.h-64)
  text @pagenum "{slide.n} / {deck.total}" style=footer x=(slide.w-$margin) y=(slide.h-64) anchor=right
}
```

Ein Theme kann mehrere Master haben (z. B. `master plain` ohne Fußzeile für Titelfolien).

### 6.5 Layouts, Platzhalter und Regionen

```
layout title master=default {
  background fill=$primary
  hide @accentbar @footer @pagenum
  slot @title style=title color=#FFFFFF x=$margin y=360 w=$content.w placeholder="Titel"
  slot @subtitle style=body color=#CCFBF1 x=$margin y=@title.bottom+32 w=$content.w placeholder="Untertitel"
}

layout content master=default {
  slot @title style=h1 x=$margin y=96 w=$content.w placeholder="Folientitel"
  region content x=$margin y=$content.y w=$content.w h=(slide.h-$content.y-140)
}

layout columns master=default {
  slot @title style=h1 x=$margin y=96 w=$content.w placeholder="Folientitel"
  region content x=$margin y=$content.y w=$content.w h=(slide.h-$content.y-140)
  region col1 x=$margin y=$content.y w=(($content.w-2*$gap)/3) h=content.h
  region col2 x=(col1.right+$gap) y=$content.y w=col1.w h=content.h
  region col3 x=(col2.right+$gap) y=$content.y w=col1.w h=content.h
}
```

- `slot @id` = Platzhalter, auf der Folie mit `fill @id "…"` befüllt. Unbefüllte Slots sieht
  man nur im Editor (gestrichelt), nicht im Export. Bild-Platzhalter: `slot @foto kind=image`.
- `region name …` = benannte Fläche, auf Folien nutzbar als `name.x`, `name.w` usw. und in
  `within=name`.
- Ein Layout kann Master-Objekte mit `hide` ausblenden oder mit `set` ändern.
- Der Platzhalter-Inhalt ist beim Auswerten des Layouts schon bekannt, deshalb funktioniert
  `y=@title.bottom+32` auch bei mehrzeiligen Titeln.

### 6.6 Kapiteltrenner mit automatischem „Teil X von Y“

```
layout section master=default {
  hide @footer
  text @part "Teil {section.n} von {deck.sections}" style=small align=center x=$margin y=340 w=$content.w
  slot @title style=title align=center x=$margin y=420 w=$content.w placeholder="Kapitel"
}
```

### 6.7 Komponenten

Komponenten sind wiederverwendbare Bausteine mit Parametern. Innerhalb sind alle
Koordinaten relativ zur Komponente, `param.name` liest Parameter, `param.w`/`param.h` die Größe.

```
component card w=520 h=360 title="Überschrift" body="Text" {
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  rect @bar w=8 h=(param.h-64) x=0 y=32 fill=$primary
  text @heading param.title style=h2 x=40 y=36 w=(param.w-72)
  text @text param.body style=body x=40 y=@heading.bottom+16 w=(param.w-72)
}

component kpi w=400 h=220 value="0" label="Kennzahl" {
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  text @value param.value font=heading size=96 color=$primary x=32 y=24
  text @label param.label style=small x=32 y=@value.bottom+4 w=(param.w-64)
}
```

Verwendung: `use @k1 kpi value="640" label="Aufträge"`. Rich-Text-Markup in Parametern
funktioniert (`body="**fett**"`). Parameter wie Farben gehen auch: `component logo color=#E13800`
mit `fill=param.color`.

### 6.8 Design-Tipps für gute Themes

- **Alle Farben und Abstände als `color`/`token`** – Folien verwenden nur `$name`. So lässt
  sich das Theme später an einer Stelle ändern.
- **Wenige Textstile** (title, h1, h2, body, small, caption, footer) mit festem Größenraster.
  Lesbar auf 1920×1080: Fließtext ≥ 28 px, Fußzeilen ≥ 18 px.
- **Regionen für jedes Raster** (`content`, `col1..3`, `left/right`), damit Folien keine
  Zahlen raten müssen.
- **Wiederkehrende Elemente als Komponente**, nicht als kopierte Formen.
- **Logos als Vektor** (`path` in einer Komponente mit `color`-Parameter) bleiben scharf und
  sind umfärbbar; Bilder gehen auch (`image` im Master).
- Für den PowerPoint-Export: Was ganz unten im Master liegt und nur aus Rechtecken, Text und
  Bildern besteht, wird zum PowerPoint-Folienmaster. Alles andere landet editierbar auf den
  Folien (siehe [9](#9-export)).

## 7. Die mitgelieferten Vorlagen

Im Startdialog unter „Neu aus Vorlage“ und in `examples/`:

| Vorlage | Layouts | Komponenten |
| --- | --- | --- |
| Eingebautes Standard-Theme (ohne `theme`-Zeile) | `title`, `content`, `blank` | – |
| `examples/hka-seminar` | `title`, `content`, `columns`, `statement`, `section`, `closing`, `blank` | `panel(title, body)`, `tower(color)`, `hka(color)` |
| `examples/hka-projektarbeit` | `title`, `content`, `columns`, `split`, `section`, `closing`, `blank` | `card(title, body)`, `ncard(num, title, body)`, `callout(label, body)`, `kpi(value, label)`, `step(num, title, body)`, `hka(color)`, `hka_v(color)` |
| `examples/guide` (dieser Guide) | `title`, `content`, `columns`, `section`, `blank` | `card(title, body)`, `kpi(value, label)` |
| `examples/deck.forme` + `themes/corporate.forme` | `title`, `content` | `kpi(label, value)` |

Slots: `title`-Layouts haben meist `@title`, `@subtitle` (Projektarbeit zusätzlich `@context`,
`@author`; Seminar `@author`), Inhalts-Layouts `@title`, `statement` hat `@statement`,
`closing` hat `@title` und `@subtitle` bzw. `@body`. Im Zweifel die Theme-Datei lesen: jede
`slot @…`-Zeile ist ein Platzhalter, jede `region …`-Zeile eine Fläche.

## 8. Arbeiten im Editor

**Projekte (Strg+O):** Browser-Projekte werden automatisch im Browser gespeichert;
Ordner-Projekte (Chrome/Edge) bearbeiten Dateien direkt auf der Platte (Strg+S). Sichern per
„Datei → Als ZIP herunterladen“.

**Was eine Geste im Code bewirkt:**

| Du tust | Im Code passiert |
| --- | --- |
| Objekt mit Zahlen-Position verschieben | Die Zahl wird ersetzt (`x=100` → `x=130`) |
| Objekt verschieben, dessen Position berechnet ist (`$margin`, `@a.right`, `align`, `distribute`, `like=`, Theme) | Eine Zeile `set @id x=…` wird nach der letzten Zeile eingefügt, die das Objekt betrifft |
| Neues Objekt zeichnen | Neue Zeile am Ende der Folie mit freier ID (`rect @rect3 …`) |
| Doppelklick auf Text | Text wird direkt im String geändert (Platzhalter `{…}` bleiben erhalten) |
| Objekt löschen | Zeile entfernt, ID aus `align`-/`distribute`-Listen gestrichen; Warnung bei Bezügen |
| Objekt aus dem Master löschen | `hide @id` wird eingefügt |
| Toolbar „Ausrichten/Verteilen“ | `align …`/`distribute …` wird angehängt; **mit Alt** werden die Zahlen direkt geschrieben |
| Kommandozeile (Strg+K) | Getippte Zeile wird ans Ende der Folie gehängt |

Der **Theme-Modus** (Strg+Umschalt+T) zeigt die Theme-Datei; Gesten ändern dann das Theme statt
der Folie.

**Tastenkürzel:** V/R/O/L/A/T/I Werkzeuge · Pfeiltasten schieben (Umschalt: 10 px) · Strg+D
duplizieren · Entf löschen · Strg+Z/Strg+Umschalt+Z Undo/Redo (gemeinsam für Code und Folie) ·
Strg beim Ziehen: kein Einrasten · Umschalt beim Skalieren: Seitenverhältnis · F5 präsentieren ·
Strg+P PDF.

**Fehler:** Rot unterstrichen im Code. Eine Folie mit Fehler zeigt den letzten gültigen Stand
(„veraltet“) und ist auf der Folienseite gesperrt, bis der Fehler behoben ist.

## 9. Export

- **PDF:** Strg+P bzw. „Exportieren → PDF“ öffnet den Druckdialog, Ziel „Als PDF speichern“.
  Sieht exakt aus wie im Editor, Schriften eingebettet. CLI: `forme compile deck.forme`.
- **PPTX:** Download, in PowerPoint editierbar. Layouts werden Folienmaster, Platzhalter
  werden PowerPoint-Platzhalter, Notizen Sprechernotizen. Berechnete Positionen werden als
  feste Werte übernommen. Nicht übernommen bzw. gerastert: Eckenradius an Bildern, ungleiche
  Eckenradien, Pfade mit `S/T/A`-Befehlen. Zeilenumbrüche können in PowerPoint leicht abweichen.
- **ODP:** nur per CLI (`--out deck.odp`, braucht LibreOffice).

## 10. Regeln für KI-Assistenten

Diesen Abschnitt kann man einer KI als Anweisung mitgeben.

### Arbeitsregeln

1. **Nur Forme-Syntax aus diesem Guide und `docs/language.md` verwenden.** Keine erfundenen
   Verben oder Schlüssel. Unbekannte Schlüssel erzeugen Warnungen, unbekannte Verben Fehler.
2. **Deck- und Theme-Dateien trennen.** `token`, `color`, `font`, `style`, `master`,
   `layout`, `component`, `size` stehen **nur** in der Theme-Datei. Im Deck auf oberster Ebene
   nur `deck`, `theme`, `section`, `counter`, `slide`.
3. **Eindeutige IDs** pro Folie (`@name`, nur Buchstaben/Ziffern/`_`). Folien-IDs im Deck
   eindeutig. Sprechende Namen verwenden (`@umsatz_chart`, nicht `@x1`).
4. **Bezüge nur rückwärts:** `@a.right` erst nach der Zeile, die `@a` erzeugt.
5. **Layouts und Platzhalter nutzen:** Titel per `fill @title`, Inhalt in die Regionen des
   Layouts (`content.x`, `col1.w`, `within=content`) statt Zahlen zu raten. Für Folien mit
   mehreren Blöcken bevorzugt `row`/`column` (`row @x within=content …`) statt absoluter
   Positionen.
6. **Theme-Werte statt Literale:** Farben als `$primary` usw., Abstände als `$margin`/`$gap`,
   Textformate per `style=`. Literale Farben nur, wenn das Theme nichts Passendes hat.
7. **Wiederholungen als Komponente** (im Theme) oder mit `like=`; Gleichverteilung mit
   `distribute`/`stack`/`grid`.
8. **Blöcke in `{ }`**, `{` am Zeilenende, `}` allein in einer Zeile, Inhalt 2 Leerzeichen
   eingerückt. Werte mit Leerzeichen in Klammern.
9. **Text kurz halten:** Folien sind 1920×1080 px. Fließtext mit `w=` begrenzen, damit er
   umbricht; nicht mehr als ca. 6 Punkte pro Folie.
10. **Bestehende Dateien minimal ändern:** Bei Änderungswünschen nur die betroffenen Zeilen
    ändern, Reihenfolge und Kommentare erhalten (die Datei ist die Quelle der Wahrheit).
11. **Prüfen:** Wenn möglich `forme check deck.forme` ausführen und alle Fehler beheben,
    bevor das Ergebnis zurückgegeben wird.

### Vorgehen bei „Erstelle eine Präsentation über X“

1. Theme wählen (vorhandenes lesen: Layouts, Slots, Regionen, Komponenten, Stile) oder neu bauen.
2. Gliederung festlegen: Titelfolie, Agenda, je Abschnitt `section "…"` + Folien, Abschluss.
3. Pro Folie das passende Layout wählen, `fill` für Platzhalter, Inhalte mit Komponenten,
   Listen, Tabellen, Bildern.
4. Sprechernotizen mit `notes "…"` ergänzen.
5. Vollständige Dateien ausgeben (Deck, ggf. Theme), jeweils als eigener Codeblock mit
   Dateiname.

### Vorgehen bei „Baue ein Theme nach Vorlage Y“ (z. B. aus einer PPTX)

1. Maße auf 1920×1080 umrechnen (16:9; bei 10 in Breite: 1 pt = 2,667 px, 1 in = 192 px).
2. Farben, Schriftgrößen, Abstände als `color`/`token`/`style` festhalten.
3. Wiederkehrende Elemente in den Master (Fußzeile, Logo), Folientypen als Layouts mit `slot`
   und `region`, wiederkehrende Bausteine als `component`.
4. Ein Beispiel-Deck schreiben, das jedes Layout und jede Komponente einmal nutzt, und prüfen.

### Antwortformat (Vorlage)

````
Datei: themes/mein-theme.forme
```
theme "…"
…
```

Datei: deck.forme
```
deck "…"
theme "./themes/mein-theme.forme"
…
```
````

## 11. Fallstricke und Fehlermeldungen

| Meldung / Symptom | Ursache | Lösung |
| --- | --- | --- |
| `Unbekanntes Objekt „@x“ (Objekte müssen vor ihrer Verwendung definiert sein)` | Bezug auf ein späteres oder nicht existierendes Objekt | Zeile nach unten verschieben oder ID prüfen |
| `„token“ ist eine Theme-Definition und gehört in eine Theme-Datei` | Definition im Deck | In die Theme-Datei verschieben |
| `ID „@x“ ist bereits vergeben` | Doppelte ID auf der Folie (auch Master/Layout zählen mit) | Umbenennen, für Master-Objekte `set @x …` verwenden |
| `Unbekannter Slot „@x“ – das Layout definiert ihn nicht` | `fill` auf einen Platzhalter, den das Layout nicht hat | Slots im Theme nachsehen oder `text` statt `fill` |
| `„@x“ ist ein Objekt, kein Wert – z. B. @x.x verwenden` | `x=@a` statt `x=@a.x` | Eigenschaft angeben (Ausnahme: `like=`, `in=`, `within=`, `to=`) |
| `Unbekanntes Token „$x“` | Token fehlt im Theme oder Tippfehler | Im Theme definieren |
| `Unbekannte Eigenschaft „k“ für …` (Warnung) | Schlüssel gibt es für dieses Verb nicht | Spickzettel prüfen |
| `Unerwartetes Zeichen` in einem Wert | Leerzeichen im Wert ohne Klammern | `w=(slide.w - 100)` |
| `Theme-Datei „…“ nicht gefunden` | Pfad falsch oder außerhalb des Projektordners | Pfad relativ zum Deck, im Projekt ablegen |
| Bildunterschrift steht an der alten Stelle | `move`/`set` am Bild **nach** `number … caption=` | Erst positionieren, dann `number` |
| `token ring.1 …` scheitert | Ziffer direkt nach dem Punkt | `ring1` |
| Kursiver Text sieht „schräg gerechnet“ aus | Kursiver Schnitt fehlt | `font … italic=true file=…` ergänzen |
| Änderung an `set @komponente title=…` wirkt nicht | Komponenten-Parameter werden nur in der `use`-Zeile ausgewertet | Parameter in der `use`-Zeile ändern |

## 12. Spickzettel

```
// Deck
deck "Titel"
theme "./themes/x.forme"
section "Abschnitt"
counter name [start=0]
slide @id [layout=name] [master=name] [hidden=true]

// Erzeugen (auf Folien, in Mastern, Layouts, Gruppen, Komponenten)
rect @id x y w h fill stroke stroke.width stroke.dash radius radius.tl… opacity shadow.x/y/blur/color
ellipse @id …wie rect ohne radius
line|arrow @id x y x2 y2 stroke stroke.width stroke.dash [head=end|start|both|none]
polygon @id points="x,y x,y …" x y [w h]
path @id d="M… L… C… Q… Z" x y [w h]
text @id "Text" x y [w h] style font size weight italic color line align valign anchor pad fill radius
code @id lang=python|java|sql|… x y [w h] [palette=light|dark] [numbers=true] [wrap=true] """…"""
math @id x y [size=48] [color] [display=false] """\frac{a}{b}"""   // LaTeX, immer als Rohtext
list @id x y w style bullet=disc|dash|number|none { item "…" [level=2] }
table @id x y w style cols="1,2" header header.fill header.color border stripe pad { row "…" "…" }
image @id "pfad" x y w [h] fit=contain|cover|fill radius
group @id x y { Kinder (relativ) }
use @id komponente x y w h [like=@andere] param=…
fill @slot "Text oder Bildpfad" [key=value …]
// Meta-Schlüssel überall: like=@a  style=name  in=@box  hidden=true

// Verändern
set @a [@b …] key=value …        move @a dx dy           resize @a w h
round @a r | tl= tr= br= bl=     style @a name           stroke @a farbe breite [dash=]
shadow @a [x y blur color] | none                        opacity @a 0.5
hide @a …   show @a …            z @a front|back|forward|backward|n

// Layout-Container (verschachtelbar)
row @id [x y w h | within=region | in=@box] [gap=] [pad=] [align=stretch|start|center|end] [justify=start|center|end|between|around] [cols=12] [fill radius …]
column @id …wie row (ohne cols)
  // Kinder: [w=] bzw. [h=] fest, sonst [span=N] Anteil am freien Platz
box @id [x y w h] [pad=] [fill stroke radius shadow …] { Kinder frei, relativ zur Innenfläche; box.w, box.h, % }

// Anordnen
align left|center|right|top|middle|bottom @a @b … [to=slide|first|last|@id|region]
distribute h|v @a @b @c [within=region|slide|@id] [gap=]
stack h|v @a @b … [gap=] [align=start|center|end] [x= y=]
grid @a @b … [cols=] [gap=] [within=] [x= y= w=] [rowh=]

// Sonstiges (Folie)
number zähler [@ziel] [caption="… {zähler} …"] [pos=below|above] [gap=] [style=]
notes "…"
background fill=… [image="…"] [fit=cover|contain|fill]

// Theme
theme "Name"            size 1920x1080
token name wert         color name #RRGGBB
font name "Familie" [weight=] [italic=true] [file="…"]
style name [base=andere] key=value …
master name { background, Objekte }
layout name [master=] { slot, region, background, hide, set, Objekte }
component name [w= h= param="default" …] { Ops mit param.name, param.w, param.h }
region name x y w h     (in Master/Layout)
```
