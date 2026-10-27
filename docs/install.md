# Installation

Forme gibt es als Web-App, als Kommandozeilenprogramm `forme` und als Erweiterung für VS Code.
Alle drei verwenden denselben Compiler: Eine Präsentation sieht überall gleich aus.

## Web-App

Nichts zu installieren: **[Editor öffnen](../)**. Die App läuft komplett im Browser, ohne Konto
und ohne Server. Projekte liegen im Browser (alle Browser) oder direkt in einem Ordner auf dem
Rechner (Chrome, Edge, Opera). Sichern und weitergeben über „Datei → Als ZIP herunterladen“.

## Kommandozeile

### Voraussetzungen

- **Node.js 20** oder neuer (`node --version`). Download auf [nodejs.org](https://nodejs.org).
- Für **PDF**: Google Chrome, Microsoft Edge oder Chromium. Forme findet ein installiertes Chrome
  oder Edge selbst. Alternativ: `npx playwright install chromium`, oder den Pfad zu einem Browser
  mit `--chromium <pfad>` bzw. der Umgebungsvariable `FORME_CHROMIUM` angeben.
- Für **ODP**: LibreOffice; `soffice` muss im Pfad liegen.

### Aus einem Release installieren

Jedes Release auf GitHub enthält das fertige Paket `forme-cli.tgz`:

```text
npm install -g https://github.com/K1ngGrim/forme/releases/latest/download/forme-cli.tgz
forme --version
```

Aktualisieren: denselben Befehl erneut ausführen. Entfernen: `npm uninstall -g forme-cli`.

### Aus dem Quellcode bauen

```text
git clone https://github.com/K1ngGrim/forme.git
cd forme
corepack enable          # stellt pnpm bereit
pnpm install
pnpm --filter @forme/cli bundle
npm install -g ./packages/cli/dist
```

`pnpm --filter @forme/cli bundle` erzeugt `packages/cli/dist`: eine einzelne Datei `forme.mjs`
plus die Vorlagen. Im Repository geht es auch ohne Installation mit `pnpm forme <befehl>`.

Den Stand eines beliebigen Commits gibt es ohne Bauen in GitHub unter **Actions → Pages →
(Lauf) → Artifacts → `forme-cli`**: entpacken und `npm install -g ./forme-cli` ausführen.

### Erste Schritte

```text
forme init vortrag -t hka-seminar      # Projekt aus einer Vorlage
cd vortrag
forme watch deck.forme                 # PDF bei jeder Änderung neu erzeugen
```

Alle Befehle und Optionen stehen unter [Kommandozeile](tools.md#kommandozeile).

### LibreOffice für ODP

| System | Installation |
| --- | --- |
| macOS | `brew install --cask libreoffice` |
| Windows | Installer von [libreoffice.org](https://www.libreoffice.org), danach `C:\Program Files\LibreOffice\program` zum Pfad hinzufügen |
| Debian, Ubuntu | `sudo apt install libreoffice-impress` |
| Fedora | `sudo dnf install libreoffice-impress` |

## VS Code

### VSIX aus einem Release

1. `forme.vsix` aus dem [neuesten Release](https://github.com/K1ngGrim/forme/releases/latest)
   herunterladen.
2. In VS Code: Erweiterungen → `…` → „Aus VSIX installieren …“, oder im Terminal:

```text
code --install-extension forme.vsix
```

### VSIX selbst bauen

```text
pnpm install
pnpm --filter forme-vscode package     # erzeugt apps/vscode/forme.vsix
code --install-extension apps/vscode/forme.vsix
```

Auch hier liegt der Stand jedes Commits unter **Actions → Pages → (Lauf) → Artifacts →
`forme-vscode`**.

Danach eine `.forme`-Datei öffnen: Hervorhebung und Fehler erscheinen sofort, `Strg+K V` öffnet
die Vorschau, „Forme: Im Forme-Editor öffnen“ den vollständigen Editor. Mehr unter
[VS Code](tools.md#vs-code).

## Entwickeln

Wer an Forme selbst arbeitet:

```text
corepack enable
pnpm install
pnpm dev           # Web-App auf http://localhost:5173
pnpm docs          # diese Dokumentation auf http://localhost:4174
pnpm test          # Unit-Tests
pnpm test:e2e      # Ende-zu-Ende-Tests mit Chromium
pnpm typecheck
```

Voraussetzungen: Node.js 22 und pnpm 10 (über `corepack`). Für die Ende-zu-Ende-Tests einmal
`pnpm --filter @forme/web exec playwright install chromium`.
