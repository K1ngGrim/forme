# Forme – Sprachreferenz

Diese Referenz ist verbindlich. Jede Änderung an der Sprache wird hier nachgezogen
(siehe Checkliste in `CLAUDE.md`).

## Grundlagen

Eine Forme-Datei ist zeilenbasiert: **eine Operation pro Zeile**. Operationen, die weitere
Operationen enthalten (Folien, Master, Layouts, Komponenten, Gruppen, Zeilen, Spalten, Listen,
Tabellen), öffnen am Zeilenende einen **Block in geschweiften Klammern**.

```
<verb> [@id] [Positionsargumente] [key=value ...]   // Kommentar
<verb> [@id] [Argumente] {                          // Block
  <verb> …
}
```

- `{` steht am Ende der Zeile mit der Operation, `}` allein in einer eigenen Zeile (danach
  höchstens ein Kommentar). Ein leerer Block darf `{}` geschrieben werden, ein Block ohne
  Inhalt kann auch ganz entfallen.
- Einrückung hat **keine Bedeutung**. Üblich sind 2 Leerzeichen pro Ebene; der Editor rückt
  beim Schreiben so ein und hält sich beim Rückschreiben an die vorhandene Einrückung.
- Dateien in der früheren Einrückungs-Syntax (Blöcke nur durch Einrückung) meldet der Parser
  mit einem Hinweis. `forme migrate <datei>` stellt sie um, ebenso der Befehl „Auf
  Klammer-Syntax umstellen“ in der App und in VS Code. Dabei werden nur Klammern eingefügt;
  Kommentare und Formatierung bleiben erhalten.

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
| Rohtext | `"""…"""` | darf mehrere Zeilen umfassen, ohne Escapes und Interpolation (siehe unten) |
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

### Rohtext über mehrere Zeilen

Zwischen `"""` und `"""` steht Text wörtlich, auch über mehrere Zeilen: keine Escapes, keine
`{…}`-Interpolation. Ein Zeilenumbruch direkt nach den öffnenden Anführungszeichen und die
Zeile vor den schließenden fallen weg, die gemeinsame Einrückung aller Zeilen wird entfernt.
Damit lässt sich Text passend zum Block einrücken:

```
slide @zitat layout=content {
  fill @title "Rohtext"
  text @t x=120 y=300 w=1600 style=body """
    Erste Zeile
      zweite Zeile, eingerückt
    {keine Interpolation}
  """
}
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

slide @intro layout=title [master=default] [hidden=true] {
  fill @title "Quartalsbericht Q3"
}
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

master default {
  background fill=#FFFFFF
  text @pagenum "{slide.n}" style=footer x=(slide.w-$margin) y=(slide.h-60) anchor=right
}

layout content master=default {
  slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin) placeholder="Titel"
  region content x=$margin y=240 w=(slide.w-2*$margin) h=(slide.h-360)
}

component kpi w=520 h=320 label="Kennzahl" value="0" {
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  text @value param.value style=h1 x=32 y=48
}
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

Jede Operation hat eine eigene Seite in [`reference/`](reference/) mit allen Parametern,
Typen, Standardwerten und Beispielen. Diese Seiten sind Teil der verbindlichen Referenz: Ändert
sich eine Operation, wird ihre Seite mitgezogen (ein Test prüft, dass jede Operation und jeder
Schlüssel aus `packages/core/src/vocab.ts` dort beschrieben ist).

| Gruppe | Operationen |
| --- | --- |
| [Erzeugen](reference/erzeugen.md) | `rect` `ellipse` `line` `arrow` `polygon` `path` `text` `list` `item` `image` `table` `group` `use` |
| [Layout](reference/layout.md) | `row` `column` `align` `distribute` `stack` `grid` |
| [Verändern](reference/veraendern.md) | `set` `move` `resize` `round` `style` `stroke` `shadow` `opacity` `hide` `show` `z` |
| [Folien und Deck](reference/folien.md) | `deck` `theme` `slide` `section` `fill` `notes` `background` `number` `counter` |
| [Theme](reference/theme.md) | `theme` `size` `token` `color` `font` `style` `master` `layout` `slot` `region` `component` |

Parameter, die viele Operationen teilen (Position, Füllung, Kontur, Schatten, Text, `like=`,
`style=`, `in=`, `within=`), sind in [`reference/_parameter.md`](reference/_parameter.md)
beschrieben.

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
| Ausdrücke, `align`/`distribute`/`stack`/`grid`, `row`/`column`, Komponenten, Gruppen | auf berechnete Positionen eingefroren; Container-Hintergründe als Rechteck |
