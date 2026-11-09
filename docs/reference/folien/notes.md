---
summary: Sprechernotizen einer Folie.
---
# notes

Hängt eine Sprechernotiz an die Folie. Mehrere `notes`-Zeilen werden zusammengefügt. Notizen
erscheinen im Präsentationsmodus, werden nach PPTX als Sprechernotizen exportiert und stehen
auf Wunsch im PDF neben der Folie (siehe unten).

```forme
slide @a layout=content {
  fill @title "Kennzahlen"
  notes "Wachstum im Süden betonen."
  notes "Danach zu den Kosten überleiten."
}
```

Längere Notizen schreibt man als Rohtext; eine Leerzeile trennt Absätze, Markup wie `**fett**`
gilt wie in Texten:

```forme
slide @b layout=content {
  fill @title "Ausblick"
  notes """
    Zuerst die **drei Ziele** nennen.
    Dann auf das Budget eingehen.

    Fragen erst am Ende zulassen.
  """
}
```

### PDF mit Notizen (pympress)

Der Export „PDF mit Notizen“ (App und VS Code: im Export-Menü; CLI: `forme compile deck.forme
--notes`) erzeugt Seiten, die doppelt so breit sind wie die Folie: links die Folie, rechts die
Notizen mit Foliennummer, Abschnitt und Titel. Präsentationsprogramme wie
[pympress](https://github.com/Cimbali/pympress) erkennen dieses Format (wie Beamers „notes on
second screen“) und zeigen dem Publikum nur die linke Hälfte, dir auf dem zweiten Bildschirm
die Notizen. Lange Notizen bekommen automatisch eine kleinere Schrift.

```
forme compile vortrag.forme vortrag-notizen.pdf --notes
pympress vortrag-notizen.pdf
```

## Parameter

### text
- Typ: Text
- positional
- erforderlich

Die Notiz.
