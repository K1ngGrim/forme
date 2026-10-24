# Forme – Sprachreferenz

Diese Referenz ist verbindlich. Jede Änderung an der Sprache wird hier nachgezogen
(siehe Checkliste in `CLAUDE.md`).

## Grundlagen

Eine Forme-Datei ist zeilenbasiert: **eine Operation pro Zeile**, Blöcke entstehen durch
Einrückung mit **2 Leerzeichen**.

```
<verb> [@id] [Positionsargumente] [key=value ...]   // Kommentar
```

- Argumente werden durch Leerzeichen getrennt. Ein Wert ohne Leerzeichen steht direkt
  (`y=@title.bottom+24`), sonst in Klammern (`w=(slide.w - 2*$margin)`).
- Kommentare beginnen mit `//` und laufen bis zum Zeilenende.
- Operationen einer Folie werden **von oben nach unten** ausgeführt. Eine Operation sieht nur
  den Zustand, den die vorherigen erzeugt haben. Verweise auf später definierte Objekte sind
  ein Fehler, Zyklen sind dadurch ausgeschlossen.
- Fehler werden als Diagnosen gemeldet. Die Auswertung bricht nie ab.

## Werte und Ausdrücke

| Form | Beispiel | Bedeutung |
| --- | --- | --- |
| Zahl | `120`, `1.5`, `12px` | Pixel im Folienkoordinatensystem (Standard 1920×1080) |
| Prozent | `10%` | relativ zur Folie: bei x/w/x2/dx zur Breite, sonst zur Höhe |
| Größe | `1920x1080` | nur bei `size` |
| Zeichenkette | `"Text"` | Escapes: `\"`, `\\`, `\n`, `\t` |
| Farbe | `#1E40AF`, `#fff`, `#00000080`, `rgba(0,0,0,0.25)`, `rgb(…)` | |
| Token | `$primary`, `$space.l` | aus dem Theme (`token`, `color`) |
| Objektbezug | `@box.x`, `@title.bottom` | Eigenschaft eines vorher definierten Objekts |
| Name | `slide.w`, `content.x`, `left` | eingebaute Namen, Regionen, Schlüsselwörter |
| Rechnung | `(slide.w - 2*$margin)` | `+ - * /`, Klammern, unäres Minus |
| Funktion | `min(a,b)`, `max`, `round`, `floor`, `ceil`, `abs`, `rgba`, `rgb` | |

**Objekt-Eigenschaften:** `x`, `y`, `w`, `h`, `left`, `right`, `top`, `bottom`, `cx`, `cy`,
`middle`, `center`. `center` steht je nach Achse des Schlüssels für `cx` oder `cy`
(z. B. `y=@box.center`). Die Werte beziehen sich auf die sichtbare Box. Zusätzlich lassen sich
alle Eigenschaften lesen (`@t.size`).

**Eingebaute Namen:** `slide.w`, `slide.h`, `slide.n` (Foliennummer, ausgeblendete Folien
zählen nicht mit), `slide.cx`, `slide.cy`, `deck.total`, `deck.title`, `deck.sections`
(Anzahl der Abschnitte), `section`, `section.n`, `counter.<name>` oder kurz `<name>` für Zähler, `<region>.x/.y/.w/.h/...`
für Regionen des Layouts, `param.<name>` in Komponenten.

### Interpolation

Zeichenketten können Ausdrücke in `{…}` enthalten:

```
text @footer "Folie {slide.n} von {deck.total} – {section}"
number figure @chart caption="Abb. {figure}: Umsatz nach Region"
```

### Rich Text

Innerhalb von Text-Zeichenketten:

| Markup | Wirkung |
| --- | --- |
| `**fett**` | fett |
| `*kursiv*` | kursiv |
| `[Text](https://…)` | Link |
| `[Text](#DC2626)` | farbiger Abschnitt |
| `\*`, `\[` | Zeichen ohne Markup-Bedeutung |
| `\n` | Zeilenumbruch |

## Dateiarten

### Deck

```
deck "Quartalsbericht Q3"
theme "./themes/corporate.forme"     // optional, sonst eingebautes Standard-Theme

section "Zahlen"                     // gilt für alle folgenden Folien
counter step start=0                 // eigener Zähler

slide @intro layout=title [master=default] [hidden=true]
  fill @title "Quartalsbericht Q3"
  …
```

Auf oberster Ebene eines Decks sind nur `deck`, `theme`, `section`, `counter` und `slide`
erlaubt. Definitionen (`token`, `color`, `font`, `style`, `master`, `layout`, `component`,
`size`) gehören ausschließlich in eine Theme-Datei.

### Theme

```
theme "Corporate"
size 1920x1080

token margin 120
token space.l 32
color primary #1E40AF
font heading "Inter" weight=700 file="./fonts/Inter-Bold.ttf"
style h1 font=heading size=64 color=$primary
style h2 base=h1 size=48                 // erbt von h1
counter figure start=0

master default
  background fill=#FFFFFF
  text @pagenum "{slide.n}" style=footer x=(slide.w-$margin) y=(slide.h-60) anchor=right

layout content master=default
  slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin) placeholder="Titel"
  region content x=$margin y=240 w=(slide.w-2*$margin) h=(slide.h-360)

component kpi w=520 h=320 label="Kennzahl" value="0"
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  text @value param.value style=h1 x=32 y=48
```

Ein Theme ist eine gewöhnliche Forme-Datei. Das eingebaute Standard-Theme ist ebenfalls in
Forme geschrieben (`packages/core/src/builtin.ts`) und definiert die Layouts `title`,
`content` und `blank`.

### Auswertungsreihenfolge pro Folie

Theme-Globals → Master-Ops → Layout-Ops → Folien-Ops. Folien-Ops dürfen Objekte aus Master und
Layout per `set @id …` überschreiben oder per `hide @id` ausblenden. Slots werden beim Anlegen
schon mit dem Inhalt ihres `fill` befüllt, damit Bezüge wie `y=@title.bottom+24` im Layout die
tatsächliche Höhe sehen.

## Operationen

### Erzeugen

Alle Erzeugungs-Ops nehmen eine ID als erstes Argument. Fehlt sie, wird intern eine vergeben
(der Editor vergibt immer eine sichtbare ID wie `@rect3`).

| Op | Positionsargumente | Wichtige Schlüssel |
| --- | --- | --- |
| `rect @id` | – | `x y w h fill stroke stroke.width stroke.dash radius radius.tl/.tr/.br/.bl opacity shadow.*` |
| `ellipse @id` | – | wie `rect` ohne Radius |
| `line @id` / `arrow @id` | – | `x y x2 y2 stroke stroke.width stroke.dash`, bei `arrow`: `head=end|start|both|none` |
| `polygon @id` | – | `points="0,0 100,0 50,80"` (relativ), `x y`, optional `w h` zum Skalieren |
| `path @id` | – | `d="M0 0 L100 0 …"`, `x y`, optional `w h` zum Skalieren |
| `text @id "Inhalt"` | Text | `font size weight italic color line align valign anchor pad fill radius w h` |
| `list @id` | – | wie `text` plus `bullet=disc|dash|number|none`; Kinder: `item "Text" [level=2]` |
| `image @id "pfad.png"` | Pfad | `x y w h fit=contain|cover|fill radius stroke` (ohne `h`: Seitenverhältnis des Bildes) |
| `table @id` | – | `x y w cols="1,2,1" size color pad header=true header.fill header.color border stripe`; Kinder: `row "A" "B" "C"` |
| `group @id` | – | `x y opacity`; Kinder sind Erzeugungs-/Änderungs-Ops mit Koordinaten **relativ** zur Gruppe (auch Bezüge wie `@a.bottom` liefern innerhalb der Gruppe relative Werte) |
| `use @id komponente` | Komponentenname | `x y w h` und Parameter der Komponente |
| `slot @id` | – (nur Layout/Master) | wie `text`, plus `kind=text|image placeholder="…"` |
| `fill @slot "Inhalt"` | Slot, Text bzw. Bildpfad | weitere Schlüssel überschreiben Eigenschaften des Slots |

**Gemeinsame Meta-Schlüssel:**

- `like=@andere` kopiert alle gesetzten Eigenschaften eines vorherigen Objekts.
- `style=h1` wendet einen Stil des Themes an.
- `in=@box` setzt die Box auf die von `@box`. Bei Text wird `pad` dann zum Innenabstand.
- `hidden=true` blendet aus.

**Text-Box-Verhalten:** Ohne `w` ist die Breite automatisch (kein Umbruch). Mit `w` wird
umgebrochen. Ohne `h` ist die Höhe automatisch. `anchor=right|center` bezieht `x` auf die
rechte Kante bzw. die Mitte. `valign` wirkt nur bei fester Höhe.

### Verändern

| Op | Form |
| --- | --- |
| `set` | `set @a [@b …] key=value …` |
| `move` | `move @a dx dy` oder `move @a dx=10 dy=-5` |
| `resize` | `resize @a w h` oder `resize @a w=400` |
| `round` | `round @a 24` oder `round @a tl=24 tr=24` |
| `style` | `style @a h1` |
| `stroke` | `stroke @a #000 2 [dash=6]` oder `stroke @a color=#000 width=2` |
| `shadow` | `shadow @a [x=0] [y=8] [blur=24] [color=rgba(0,0,0,0.25)]`, `shadow @a none` |
| `opacity` | `opacity @a 0.5` |
| `hide` / `show` | `hide @a @b …` |
| `z` | `z @a front|back|forward|backward|<index>` |

### Anordnen

Diese Ops sind *semantisch*: Sie berechnen Positionen und werden bei jeder Auswertung neu
angewendet.

| Op | Form |
| --- | --- |
| `align` | `align left|center|right|top|middle|bottom @a @b … [to=slide|first|last|@id|<region>]`. Ohne `to` gilt die gemeinsame Box der Ziele, bei einem einzelnen Ziel die Folie. |
| `distribute` | `distribute h|v @a @b @c [within=<region>|slide|@id] [gap=N]`. Reihenfolge = Reihenfolge der Argumente. |
| `stack` | `stack v|h @a @b @c [gap=N] [align=start|center|end] [x= y=]` (Auto-Layout) |
| `grid` | `grid @a @b @c @d [cols=2] [gap=24] [within=<region>] [x= y= w=] [rowh=]` |

### Nummerierung

| Op | Form |
| --- | --- |
| `counter` | `counter name [start=0]` (Deck- oder Theme-Ebene) |
| `number` | `number <zähler> [@ziel] [caption="Abb. {figure}: …"] [pos=below|above] [gap=16] [style=caption]` |
| `section` | `section "Name"` auf Deck-Ebene, verfügbar als `{section}`, `{section.n}` und `{deck.sections}` |

`number` erhöht den Zähler. Mit `caption` entsteht eine Beschriftung `@<ziel>_caption` unter
(oder über) dem Ziel, standardmäßig mit dem Stil `caption` bzw. `footer`. Zähler laufen über
alle Folien des Decks weiter.

### Sonstiges

| Op | Form |
| --- | --- |
| `notes` | `notes "Sprechernotiz"` (mehrere werden zusammengefügt, Export als PPTX-Notizen) |
| `background` | `background fill=#fff [image="bg.jpg"] [fit=cover|contain|fill]` |
| `region` | `region name x y w h` (Layout/Master), verwendbar in `within=` und als `name.x` |

### Definitionen (nur Theme)

| Op | Form |
| --- | --- |
| `theme` | `theme "Name"` (erste Zeile) |
| `size` | `size 1920x1080` |
| `token` | `token name wert` |
| `color` | `color name #RRGGBB` (als `$name` verwendbar) |
| `font` | `font name "Familie" [weight=400] [italic=true] [file="./font.ttf"]` |
| `style` | `style name [base=anderer] key=value …` |
| `master` | `master name` mit Block |
| `layout` | `layout name [master=default]` mit Block (`slot`, `region`, `background`, `hide`, Objekte) |
| `component` | `component name [w=…] [h=…] [param="default"]` mit Block; Parameter über `param.name` |

## Synchronisation mit dem Editor (Rückschreibe-Regeln)

Der Evaluator merkt sich für jede Eigenschaft, welche Operation sie zuletzt geschrieben hat
(Provenienz). Daraus folgt, wie eine Geste im Editor in die Datei zurückgeschrieben wird:

1. Literal auf der aktuellen Folie → das Literal wird ersetzt (`%`-Werte bleiben in `%`,
   `move`-Beträge werden um das Delta angepasst).
2. Ausdruck, Wert aus Master/Layout/Theme, aus `like=`/`style=` oder aus einer semantischen Op
   → `set @id prop=wert` nach der letzten Op dieser Folie, die das Objekt betrifft. Eine
   direkt folgende `set`-Zeile für dasselbe Objekt wird erweitert. Im Code sind solche
   Überschreibungen von Theme-Objekten orange markiert, im Inspector mit „Ü“.
3. Gesten auf einer Folie ändern nie die Theme-Datei. Im Theme-Bearbeitungsmodus werden
   Literale im Theme ersetzt, Ausdrücke im selben Master-/Layout-Block per `set` überschrieben.
4. Neue Objekte werden am Ende der Folie mit fortlaufender ID angehängt (`rect @rect3 …`).
5. Toolbar-Befehle hängen semantische Ops an. Mit Alt werden stattdessen die berechneten
   Literale geschrieben („backen“).
6. Löschen entfernt die Erzeugungs-Op, streicht die ID aus Mehrfachziel-Ops und entfernt Ops
   mit nur diesem Ziel. Gibt es Ausdrücke, die auf das Objekt verweisen, wird vorher gewarnt.
   Objekte aus Master/Layout werden per `hide` ausgeblendet.
7. Die Kommandozeile hängt getippte Ops am Ende der aktuellen Folie an.

## Export-Abbildung (PPTX)

| Forme | PPTX |
| --- | --- |
| Master + Layout | Folienmaster (ein Master je verwendeter Kombination) |
| Statische Master-/Layout-Objekte | Objekte des Masters |
| `{slide.n}`-Text im Master | Foliennummernfeld |
| Slots | Platzhalter (`title`, `body`, `pic`) |
| `rect`, `ellipse`, `line`, `arrow` | native Formen (abgerundet: `roundRect`) |
| `polygon`, `path` (M/L/H/V/C/Q/Z) | benutzerdefinierte Geometrie |
| `path` mit S/T/A, ungleiche Eckenradien | gerastert, im Export-Log vermerkt |
| `text`, `list` | Textfelder mit fester Breite, `autofit` aus; Listen mit Aufzählung und Ebenen |
| `table` | native Tabelle |
| `image` | Bild (SVG wird als PNG gerastert eingebettet) |
| `notes` | Sprechernotizen |
| Ausdrücke, `align`/`distribute`/`stack`/`grid`, Komponenten, Gruppen | auf berechnete Positionen eingefroren |
