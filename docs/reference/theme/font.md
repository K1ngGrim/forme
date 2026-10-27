---
summary: Schrift mit Familie, Gewicht und Datei.
---
# font

Macht eine Schrift unter einem Namen verfügbar. Mit `file` lädt Forme die Schriftdatei: Text wird
dann exakt vermessen und im PDF eingebettet. Ohne Datei verwendet der Browser die installierte
Schrift.

```text
font heading "Inter" weight=700 file="./fonts/inter-latin-700-normal.woff"
font body "Inter" weight=400 file="./fonts/inter-latin-400-normal.woff"
font body.italic "Inter" weight=400 italic=true file="./fonts/inter-latin-400-italic.woff"
```

Für fetten und kursiven Text im Fließtext (`**fett**`, `*kursiv*`) die passenden Schnitte
derselben Familie ebenfalls angeben. Der Pfad ist relativ zur Theme-Datei; möglich sind `.woff`,
`.woff2`, `.ttf` und `.otf`.

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name, über den Stile und Objekte die Schrift wählen (`font=heading`).

### familie
- Typ: Text
- positional
- erforderlich

Schriftfamilie, z. B. `"Inter"`.

### weight
- Typ: Zahl
- Standard: `400`

Gewicht dieses Schnitts.

### italic
- Typ: Wahrheitswert
- Standard: `false`

Kursiver Schnitt.

### file
- Typ: Pfad

Schriftdatei, relativ zur Theme-Datei.
