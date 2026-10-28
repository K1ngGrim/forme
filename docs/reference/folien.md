---
summary: Aufbau eines Decks – Kopf, Folien, Abschnitte, Platzhalter befüllen, Notizen, Hintergrund und Nummerierung.
ops: deck theme include slide section fill notes background number counter
---
# Folien und Deck

Eine Deck-Datei beginnt mit `deck` und optional `theme`, danach folgen Folien. Auf oberster Ebene
sind nur `deck`, `theme`, `section`, `counter` und `slide` erlaubt; alles andere steht im Block
in einer Folie.

```forme
deck "Quartalsbericht"

slide @start layout=title {
  fill @title "Quartalsbericht Q3"
  fill @subtitle "Vertrieb & Marketing"
}

section "Zahlen"

slide @kpis layout=content {
  fill @title "Kennzahlen"
  notes "Wachstum im Süden betonen."
}
```

Pro Folie werden zuerst die Operationen des Masters ausgewertet, dann die des Layouts, dann die
der Folie. Die Folie kann deshalb alles aus Master und Layout verwenden, überschreiben (`set`) und
ausblenden (`hide`).
