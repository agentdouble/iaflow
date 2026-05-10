# IAFlow

App macOS (Electron + Vite + React/TS) pour planifier et exécuter des agents IA (Claude, Codex, OpenCode). Reproduit la vue *Flow* de pickagent.

## Installation rapide (Mac)

```bash
git clone https://github.com/agentdouble/iaflow.git
cd iaflow
./install.sh
```

Le script `install.sh` :
1. Installe les dépendances npm (avec rebuild natif de `node-pty`)
2. Build l'app via vite + electron-builder
3. Copie `IAFlow.app` dans `/Applications`
4. Retire l'attribut `quarantine` macOS pour éviter le warning Gatekeeper au 1er lancement

Pour mettre à jour : `git pull && ./install.sh`.

Pour lancer l'app : Spotlight → "IAFlow", ou `open /Applications/IAFlow.app`.

## Fonctionnalités

- Création/édition de flows (nom, prompt, agent, cwd, schedule)
- Schedule : intervalle horaire, quotidien, jours de semaine, jours custom
- Catégories avec drag-and-drop pour organiser les flows
- Exécution manuelle + scheduler in-process (tick toutes les 60s)
- Terminal `xterm` live dans la card pendant l'exécution
- Historique des 7 dernières runs (succès/erreur) + viewer de log
- Parser de flux JSON Claude (`--output-format stream-json`) avec couleurs ANSI

## Persistence

Les flows et catégories sont stockés sous `~/.config/.iaflow/flows/` (un JSON par flow + `categories.json` + logs).

## Dev

```bash
npm install
npm run dev          # vite dev + electron auto-reload
```

## Build manuel

```bash
npm run build        # produit release/mac-*/IAFlow.app
npm run build:dmg    # produit un .dmg
```

## Notes

- Le scheduler ne tourne que quand l'app est ouverte.
- L'app n'est **pas signée** Apple Developer — l'install local via `install.sh` retire automatiquement le quarantine. Si tu télécharges le `.app` d'ailleurs, fais `xattr -dr com.apple.quarantine /Applications/IAFlow.app`.
- Pour Claude `--dangerously-skip-permissions` ou Codex `full-auto`, coche la case dans la modal du flow.
