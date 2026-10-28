/** Built-in default theme. It is an ordinary Forme theme file. */
export const DEFAULT_THEME_SOURCE = `theme "Standard"
size 1920x1080

token margin 120
token gap 32
color primary #2563EB
color text #111827
color muted #6B7280
color surface #F3F4F6
color accent #F59E0B
font heading "Inter" weight=700
font body "Inter" weight=400

style h1 font=heading size=80 color=$text line=1.1
style h2 font=heading size=56 color=$text line=1.2
style body font=body size=32 color=$text line=1.4
style caption font=body size=22 color=$muted
style footer font=body size=20 color=$muted

master default {
  background fill=#FFFFFF
  text @pagenum "{slide.n}" style=footer x=(slide.w-$margin) y=(slide.h-80) anchor=right
}

layout title master=default {
  hide @pagenum
  slot @title style=h1 x=$margin y=380 w=(slide.w-2*$margin) placeholder="Titel"
  slot @subtitle style=body color=$muted x=$margin y=@title.bottom+24 w=(slide.w-2*$margin) placeholder="Untertitel"
}

layout content master=default {
  slot @title style=h2 x=$margin y=$margin w=(slide.w-2*$margin) placeholder="Titel"
  region content x=$margin y=260 w=(slide.w-2*$margin) h=(slide.h-400)
}

layout blank master=default
`;

export const NEW_DECK_SOURCE = `deck "Neue Präsentation"

slide @s1 layout=title {
  fill @title "Neue Präsentation"
  fill @subtitle "Untertitel"
}
`;
