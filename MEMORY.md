# MEMORY

## 2026-06-12

- IAFlow est une app Electron + Vite + React/TS qui automatise des prompts via des "flows" persistés dans `~/.config/.iaflow/flows/`.
- Un flow contient notamment `name`, `prompt`, `agent`, `cwd`, `schedule`, `enabled` et l'historique court des runs.
- Le scheduler est in-process dans `electron/main/flow-manager.ts`, tick toutes les 60s, et ne tourne que quand l'app Electron est ouverte.
- Les schedules supportés sont `interval`, `daily`, `weekdays` et `custom`; les schedules à heure fixe matchent l'heure et la minute locales, et ne relancent pas plus d'une fois par jour.
- L'exécution construit une commande CLI pour `claude`, `codex` ou `opencode`, écrit le prompt dans un PTY, affiche la sortie live et sauvegarde les logs.
- Pour une évolution "hooks", considérer les hooks comme des triggers événementiels liés au cycle de vie d'une session agent (tool use, prompt submit, stop, file changed selon l'outil), pas comme un remplacement direct du scheduler horaire.
- Première implémentation hook ajoutée: `triggerType: "hook"`, `hookTrigger`, matching event/provider/cwd/paths, CLI `bin/iaflow-hook.mjs` avec `emit`, `run`, `--event-json`, `--dry-run`, debounce dans `~/.config/.iaflow/hook-state.json`, logs/runs dans le stockage IAFlow.
- Skill Codex global ajouté dans `~/.codex/skills/iaflow-trigger`: documente l'usage de `iaflow-hook emit`, `iaflow-hook run`, les payloads JSON, les events courants et les garde-fous anti-boucles.
- Correction Codex CLI: ne plus utiliser `--approval-mode`; pour Codex headless IAFlow utilise `codex --sandbox ... --ask-for-approval never exec --skip-git-repo-check <prompt>`. Le test event `test` a créé `/Users/jeremy/projet/lab/camarche.txt`.
- Logs headless intégrés à l'UI: `iaflow-hook` écrit un run `running` au démarrage, append le log pendant l'exécution, puis met à jour le run en `success`/`error`; l'UI poll les flows/logs pour afficher les runs headless directement dans IAFlow.
- Si l'erreur `unexpected argument '--approval-mode'` réapparaît alors que le code source est corrigé, c'est probablement une ancienne instance Electron déjà ouverte; vérifier avec `rg approval-mode electron bin dist-electron release/...` puis quitter/reouvrir IAFlow.
- Onglet `Agents` ajouté au niveau `App`: IPC `agents:list` -> `electron/main/agent-monitor.ts` scanne les process `run_headless_agent.py`, `codex exec`, `claude` et `opencode`, groupe par `cwd`/log, puis affiche les dernières lignes de `.orch/headless-agents/<worktree>/agent.log` quand le log est trouvable.
