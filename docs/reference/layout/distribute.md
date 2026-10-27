---
summary: Objekte mit gleichen Abständen verteilen.
---
# distribute

Verteilt Objekte horizontal (`h`) oder vertikal (`v`) in der Reihenfolge der Argumente. Ohne
`within` bleiben das erste und das letzte Objekt stehen und die Abstände dazwischen werden gleich.

```forme
rect @a x=120 y=380 w=300 h=300 fill=$primary
rect @b x=500 y=380 w=300 h=300 fill=$accent
rect @c x=1500 y=380 w=300 h=300 fill=$muted
distribute h @a @b @c
```

## Parameter

### richtung
- Typ: Auswahl
- positional
- erforderlich
- Werte: `h`, `v`

Horizontal oder vertikal.

### @ziele
- Typ: ID
- positional
- erforderlich

Die Objekte, in dieser Reihenfolge.

### within
- Typ: Region | ID

Verteilt über die ganze Region (`content`, `slide`) oder Box eines Objekts.

### gap
- Typ: Zahl
- Standard: gleich großer Restabstand

Fester Abstand. Mit `within` wird die Gruppe dann in der Region zentriert.

```forme
rect @a x=0 y=380 w=300 h=300 fill=$primary
rect @b x=0 y=380 w=300 h=300 fill=$accent
rect @c x=0 y=380 w=300 h=300 fill=$muted
distribute h @a @b @c within=content gap=40
```

## Beispiele

### Über den Inhaltsbereich

```forme
rect @k1 x=120 y=300 w=480 h=360 radius=24 fill=$surface
rect @k2 like=@k1
rect @k3 like=@k1
distribute h @k1 @k2 @k3 within=content
```
