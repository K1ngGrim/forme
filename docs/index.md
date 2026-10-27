# Forme

Forme ist ein Werkzeug für Präsentationen, das Code und Folie verbindet. Eine Präsentation ist
eine Textdatei, in der jede Folie als Abfolge von Operationen steht. Ein Editor zeigt Code und
Folie nebeneinander: Was du auf der Folie verschiebst, landet als kleine Änderung im Code, und
jede Änderung im Code erscheint sofort auf der Folie.

```
deck "Mein Vortrag"

slide @start layout=title
  fill @title "Hallo Forme"
  fill @subtitle "Präsentationen als Code und Canvas"
```

Jedes Beispiel in dieser Dokumentation ist echter Forme-Code. Die Vorschau daneben erzeugt
derselbe Compiler wie im Editor. Mit „Bearbeiten“ lässt sich jedes Beispiel direkt hier
ausprobieren.

## Drei Wege, mit Forme zu arbeiten

| Weg | Wofür | Start |
| --- | --- | --- |
| **Web-App** | Code und Canvas nebeneinander, Vorlagen, Export nach PDF und PPTX. Läuft komplett im Browser, ohne Konto und ohne Server. | [Editor öffnen](../) |
| **Kommandozeile** | Präsentationen bauen, prüfen und beobachten wie bei Typst: `forme watch deck.forme` | [Kommandozeile](werkzeuge/cli/) |
| **VS Code** | Hervorhebung, Fehler, Autovervollständigung und eine Live-Vorschau, in der man Objekte verschieben kann | [VS Code](werkzeuge/vscode/) |

## Wo anfangen?

- Installieren: [Installation](einstieg/installation/) der Kommandozeile und der VS Code-Erweiterung
  (die Web-App braucht keine).
- Neu hier: [Das Prinzip](einstieg/prinzip/), dann der [Schnellstart](einstieg/schnellstart/)
  und [Die Sprache in fünf Minuten](einstieg/sprache/).
- Folien bauen: die [Rezepte](anleitung/rezepte/) zeigen Text, Listen, Tabellen, Bilder,
  Formen und Komponenten, [Positionieren und Anordnen](anleitung/anordnen/) erklärt Ausdrücke,
  `align`, `distribute` und die Layout-Container `row` und `column`.
- Eigenes Design: [Ein eigenes Theme bauen](anleitung/theme/).
- Nachschlagen: die Referenz beschreibt jede Operation mit allen Parametern und Beispielen,
  z. B. [Erzeugen](referenz/erzeugen/), [Layout](referenz/layout/) oder
  [alle Operationen](referenz/operationen/).
