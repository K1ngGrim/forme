---
summary: Definitionen einer Theme-Datei – Größe, Tokens, Farben, Schriften, Stile, Master, Layouts, Platzhalter, Regionen und Komponenten.
ops: theme size token color font style master layout slot region component counter background hide
---
# Theme

Ein Theme ist eine gewöhnliche Forme-Datei mit `theme`-Kopf. Es legt fest, wie Folien aussehen:
Größe, Farben, Schriften, Textstile, Hintergründe und Layouts mit Platzhaltern. Ein Deck bindet
es mit `theme "./pfad.forme"` ein.

```text
theme "Firma"
size 1920x1080

token margin 120
color primary #1E40AF
font heading "Inter" weight=700 file="./fonts/Inter-Bold.ttf"
style h1 font=heading size=64 color=$primary

master default
  background fill=#FFFFFF
  text @pagenum "{slide.n}" style=footer x=(slide.w-$margin) y=(slide.h-60) anchor=right

layout content master=default
  slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin)
  region content x=$margin y=240 w=(slide.w-2*$margin) h=(slide.h-360)
```

Die Beispiele auf diesen Seiten zeigen oben Theme-Code und nach `---` eine Folie. Der
Theme-Code ergänzt das eingebaute Standard-Theme.
