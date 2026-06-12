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

- Création/édition de flows (nom, prompt, agent, cwd, trigger)
- Schedule : intervalle horaire, quotidien, jours de semaine, jours custom
- Hook/event trigger : déclenchement headless depuis une CLI, un hook Codex/Claude ou un watcher
- Catégories avec drag-and-drop pour organiser les flows
- Exécution manuelle + scheduler in-process (tick toutes les 60s)
- Terminal `xterm` live dans la card pendant l'exécution
- Historique des 7 dernières runs (succès/erreur) + viewer de log
- Parser de flux JSON Claude (`--output-format stream-json`) avec couleurs ANSI

## CLI hooks

`iaflow-hook` déclenche les flows configurés en mode `Hook` depuis un hook agent, un watcher fichier ou un script.

```bash
iaflow-hook emit file.changed --provider codex --cwd "$PWD" --path src/App.tsx
```

La commande lit les flows dans `~/.config/.iaflow/flows/`, matche `event`, `provider`, `cwd` et `paths`, applique le debounce du flow, puis lance le prompt en headless avec l'agent choisi.
Les runs headless sont visibles dans IAFlow : un statut `En cours` apparaît pendant l'exécution, les logs sont écrits au fil de l'eau, puis le run passe en succès ou erreur.

Dry-run :

```bash
iaflow-hook emit file.changed --provider watcher --cwd "$PWD" --path src/App.tsx --dry-run
```

Payload JSON, utile depuis un hook :

```bash
printf '%s\n' '{"type":"file.changed","provider":"codex","cwd":"'"$PWD"'","paths":["src/App.tsx"]}' \
  | iaflow-hook --event-json -
```

Lancement direct d'un flow par id ou nom :

```bash
iaflow-hook run flow_abc123
```

Exemple hook Codex local :

```toml
[[hooks.PostToolUse]]
matcher = "Edit|Write|apply_patch"

[[hooks.PostToolUse.hooks]]
type = "command"
command = 'iaflow-hook emit agent.tool-used --provider codex --cwd "$PWD"'
timeout = 30
statusMessage = "Sending file change event to IAFlow"
```

Pour matcher des patterns de fichiers, le flow IAFlow contient les globs (`src/**/*.ts`) et l'appel CLI doit passer les fichiers réellement changés avec `--path <fichier>`. Un watcher filesystem peut appeler la même commande avec `--provider watcher`.

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
- Pour Claude `--dangerously-skip-permissions` ou Codex `exec` en `danger-full-access` + approval `never`, coche la case dans la modal du flow.
