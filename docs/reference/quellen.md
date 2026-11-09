---
summary: Literatur aus einer .bib-Datei zitieren und Quellen pro Folie oder als Literaturliste anzeigen.
ops: bibliography cite for if
---
# Quellen und Zitate

Quellen kommen aus einer BibTeX-Datei, wie sie Zotero, Citavi, JabRef oder Google Scholar
exportieren. Das Deck bindet sie mit [`bibliography`](quellen/bibliography.md) ein; in jedem Text
zitiert `@schlüssel` eine Quelle, wie in Typst:

```forme
slide @a layout=content {
  fill @title "Motivation"
  text @t "Modelle lernen Abkürzungen @geirhos2020, auch in der Sicherheit @arp2022[S. 3]." x=120 y=300 w=1600 size=40
}
```

Wie ein Zitat aussieht, legt das Theme mit [`cite`](quellen/cite.md) fest (Standard: `[1]`).
Welche Quellen eine Folie oder der ganze Vortrag zitiert, steht in den Listen `slide.refs` und
`deck.refs`. Mit [`for`](quellen/for.md) baut das Template daraus beliebige Darstellungen,
etwa eine Quellenzeile am unteren Rand jeder Folie, und [`if`](quellen/if.md) zeigt sie nur,
wenn es etwas anzuzeigen gibt:

```forme
master default {
  background fill=#FFFFFF
  if slide.refs {
    column @quellen x=$margin y=930 w=(slide.w-2*$margin) gap=4 {
      for ref in slide.refs {
        text @q "[{ref.n}] {ref.authors}: *{ref.title}*. {ref.venue}, {ref.year}." style=caption
      }
    }
  }
}
---
slide @a layout=content {
  fill @title "Motivation"
  text @t "Modelle lernen Abkürzungen @geirhos2020, auch in der Sicherheit @arp2022." x=120 y=300 w=1600 size=40
}
```

Regeln:

- `@` direkt nach einem Buchstaben, einer Ziffer, `.` oder `/` beginnt kein Zitat
  (`name@firma.de` bleibt Text). Ein Punkt am Ende gehört nicht zum Schlüssel.
- Schlüssel, die nicht in der Bibliografie stehen, bleiben Text und erzeugen eine Warnung.
- Rohtext `"""…"""` (Code, Formeln) wird nicht nach Zitaten durchsucht. Zitate in
  Sprechernotizen werden nummeriert, zählen aber nicht zu den Quellen der Folie (`slide.refs`).
- Die Nummer `ref.n` richtet sich nach dem ersten Zitat im Vortrag, über alle Folien und
  eingebundenen Dateien hinweg.
- Zitate werden vor der Auswertung aus den Texten der Folie gesammelt. Deshalb kennen Master
  und Layout die Quellen schon, obwohl sie vor den Folien-Operationen ausgewertet werden.

## Felder einer Quelle

In `for` und in `cite` stehen die Felder der Quelle unter `ref.<feld>` bereit. Fehlt ein Feld
in der .bib, ist es leer.

| Feld | Inhalt |
| --- | --- |
| `ref.n` | Nummer in der Reihenfolge des ersten Zitats (0, wenn nicht zitiert) |
| `ref.key` | Schlüssel, z. B. `geirhos2020` |
| `ref.type` | Eintragsart: `article`, `inproceedings`, `book` … |
| `ref.author` | kurz: „Geirhos et al.“, „Arp & Quiring“, „Knuth“ |
| `ref.authors` | alle: „R. Geirhos, J.-H. Jacobsen und C. Michaelis“ |
| `ref.lastnames` | Nachnamen: „Geirhos, Jacobsen, Michaelis“ |
| `ref.year` | Jahr (aus `year` oder `date`) |
| `ref.title` | Titel |
| `ref.venue` | Erscheinungsort: `journal`, `booktitle`, `publisher`, `institution` … (das erste vorhandene) |
| `ref.i` | Durchlauf in `for` (1, 2, 3 …) |
| `ref.<feld>` | jedes weitere Feld der .bib: `ref.doi`, `ref.url`, `ref.pages`, `ref.volume` … |

LaTeX in der .bib (`{\"o}`, `--`, `{Großschreibung}`) wird in normalen Text umgewandelt.
