---
name: verify
description: Vérifier le projet avant de déclarer une tâche terminée ou de committer (format, lint, type check Astro, tests Vitest, build si nécessaire) et produire un rapport synthétique. À utiliser après toute modification de code, ou quand l'utilisateur demande de vérifier, valider ou tester.
argument-hint: "[--build]"
---

# Vérification du projet

1. `npm run format:check 2>&1 | tail -5` : si des fichiers sont signalés, lancer `npm run format` puis relancer la vérification.
2. `npm run lint 2>&1 | tail -20` : exiger **0 erreur**. Les warnings (`no-explicit-any`, `set-state-in-effect`, `exhaustive-deps`) ne bloquent pas, mais un warning nouveau dans le code touché doit être corrigé ou signalé. Jamais de `eslint-disable`.
3. `npx astro check 2>&1 | tail -15` : exiger **0 erreur**. Les hints ne bloquent pas ; un warning nouveau doit être signalé.
4. `npx vitest run 2>&1 | tail -15` : tous les tests doivent passer. Relire le nombre de tests dans la sortie, ne jamais le supposer. Avant un commit qui touche `src/lib`, `src/utils`, `src/config` ou `src/pages/api`, lancer `npx vitest run --coverage` : les seuils de `vitest.config.ts` doivent passer.
5. `npm run build` seulement si l'argument `--build` est donné, ou si le diff touche `astro.config.mjs`, `tailwind.config.mjs`, `src/plugins/**`, `src/integrations/**`, `src/utils/imageService.ts`, `src/content.config.ts` ou un composant d'image. Le build exige `TURSO_DATABASE_URL` : si elle manque, le dire au lieu de conclure à un échec du code.
6. Si des images ou du frontmatter ont changé, vérifier que `src/data/image-dimensions.json` est à jour (`node scripts/build/compute-image-dimensions.mjs --only=<collection>`) et inclus dans le diff.

Le hook Stop (`.claude/hooks/verify-on-stop.sh`) relance automatiquement astro check et vitest quand l'arbre a changé ; il ne remplace pas ce skill avant un commit.

En cas d'échec, montrer les lignes d'erreur exactes (fichier:ligne) et ne pas annoncer la tâche comme terminée.

## Rapport

```
format      : ✅ / ❌ (fichiers)
lint        : ✅ 0 erreur (N warnings)
astro check : ✅ 0 erreur (N warnings)
vitest      : ✅ N/N tests, M fichiers
build       : ✅ / ⏭️ non lancé (raison) / ❌ (première erreur)
dimensions  : ✅ à jour / ⏭️ pas d'image touchée / ⚠️ à régénérer
```
