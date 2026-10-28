---
summary: Folien aus einer anderen Datei einbinden, z. B. eine gemeinsame Gliederung oder ein Backup-Kapitel.
---
# include

Bindet die Folien einer anderen Forme-Datei an dieser Stelle ein. Damit lassen sich Kapitel in
eigene Dateien auslagern oder Folien in mehreren Vorträgen verwenden: eine gemeinsame
Gliederung, ein Backup-Kapitel, eine Vorstellungsfolie.

```forme
deck "Projektbericht"
theme "./theme.forme"

slide @titel layout=title {
  fill @title "Projektbericht"
}

include "./kapitel/ergebnisse.forme"
include "./gemeinsam/backup.forme"
```

Die eingebundene Datei ist eine normale Deck-Datei mit Folien, `section` und `counter`:

```forme
deck "Ergebnisse"
theme "../theme.forme"   // nur, wenn die Datei allein geöffnet wird

section "Ergebnisse"

slide @messung layout=content {
  fill @title "Messung"
  image @kurve "./img/umsatz.svg" x=120 y=260 w=900
}
```

Regeln:

- Die Folien zählen ganz normal mit: `{slide.n}`, `{deck.total}`, Abschnitte und eigene Zähler
  laufen über alle Dateien hinweg. Folien-IDs müssen im ganzen Vortrag eindeutig sein.
- Es gilt das **Theme des einbindenden Decks**. `deck` und `theme` in der eingebundenen Datei
  werden dabei übergangen; sie gelten nur, wenn man die Datei allein öffnet. So lässt sich jedes
  Kapitel auch für sich bearbeiten und ansehen.
- Pfade in der eingebundenen Datei (Bilder) sind **relativ zu dieser Datei**.
- Eingebundene Dateien dürfen selbst kein `include` enthalten.
- Eingebundene Folien werden in ihrer eigenen Datei bearbeitet. Im Editor zeigt ein Hinweis
  „Datei öffnen“; danach führt „Zurück“ wieder zum Haupt-Deck. Neue Folien nach einer
  eingebundenen Folie landen hinter der `include`-Zeile.
- Fehler in eingebundenen Dateien erscheinen mit Dateiname in der Statusleiste, in VS Code
  direkt in der Datei und in `forme check` mit Dateipfad.

## Parameter

### pfad
- Typ: Text
- positional
- erforderlich

Pfad der einzubindenden Datei, relativ zur Deck-Datei.
