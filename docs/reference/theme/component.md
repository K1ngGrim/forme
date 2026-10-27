---
summary: Wiederverwendbarer Baustein mit Parametern, eingesetzt mit `use`.
---
# component

Eine Komponente ist ein Baustein aus mehreren Objekten mit Parametern, etwa eine Kennzahl-Karte.
Folien setzen sie mit [`use`](../erzeugen/use.md) ein. In der Komponente stehen die Parameter als
`param.name` zur Verfügung, die Größe der Instanz als `param.w` und `param.h`. Koordinaten
sind relativ zur Instanz.

```forme
component karte w=520 h=360 titel="Überschrift" text="Text"
  rect @bg w=param.w h=param.h radius=24 fill=$surface
  rect @balken w=param.w h=12 radius=6 fill=$primary
  text @kopf param.titel x=32 y=48 w=(param.w-64) size=40 weight=700
  text @body param.text x=32 y=@kopf.bottom+16 w=(param.w-64) size=28 color=$muted
---
use @a karte x=120 y=300 titel="Schneller" text="Durchlaufzeit **−30 %** seit Q1."
use @b karte like=@a titel="Günstiger" text="Kosten je Vorgang deutlich gesenkt."
use @c karte like=@a titel="Zufriedener" text="NPS von 31 auf *48* gestiegen."
distribute h @a @b @c within=content
```

## Parameter

### name
- Typ: Name
- positional
- erforderlich

Name, mit dem `use @id name` die Komponente einsetzt.

### w
- Typ: Länge
- Standard: `200`

Standardbreite einer Instanz.

### h
- Typ: Länge
- Standard: `120`

Standardhöhe einer Instanz.

### parameter
- Typ: Text | Zahl | Farbe

Jeder weitere Schlüssel legt einen Parameter mit Standardwert an (`titel="Überschrift"`).
