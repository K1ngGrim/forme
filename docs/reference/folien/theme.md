---
summary: Theme-Datei einbinden – oder im Theme dessen Namen setzen.
---
# theme

In einer Deck-Datei bindet `theme "./pfad.forme"` eine Theme-Datei ein. Ohne `theme`-Zeile gilt
das eingebaute Standard-Theme mit den Layouts `title`, `content` und `blank`.

```text
deck "Mein Vortrag"
theme "./themes/firma.forme"
```

Der Pfad ist relativ zur Deck-Datei. Schriften im Theme sind relativ zur Theme-Datei.

## Im Theme

Als erste Zeile einer Theme-Datei gibt `theme "Name"` dem Theme einen Namen. Danach folgen
Definitionen: [`size`](../theme/size.md), [`token`](../theme/token.md),
[`color`](../theme/color.md), [`font`](../theme/font.md), [`style`](../veraendern/style.md),
[`master`](../theme/master.md), [`layout`](../theme/layout.md) und
[`component`](../theme/component.md).

```text
theme "Firma"
size 1920x1080
color primary #1E40AF
```

## Parameter

### pfad
- Typ: Pfad | Text
- positional
- erforderlich

Im Deck: Pfad zur Theme-Datei. Im Theme: der Name.
