---
name: perf-audit
description: Lancer l'audit Lighthouse du site (17 pages, local ou production) et analyser les résultats écrits dans src/data/lighthouse-results.json.
disable-model-invocation: true
argument-hint: "[local|prod]"
---

# Audit de performance Lighthouse

Script : `scripts/audit/lighthouse-runner.mjs`. Seule option : `--target=local|prod` (toute autre valeur retient la production). **La cible par défaut est la production**, sans détection d'un serveur local.

## Préparer

- Cible `prod` (https://www.miroirspolaires.fr) : rien à préparer.
- Cible `local` (http://localhost:4321) : il faut un serveur lancé. `npm run dev` n'est pas représentatif (pas de minification, HMR). `npm run preview` n'est pas fiable avec l'adaptateur Vercel : il sert `dist/`, alors que le client est dans `dist/client`, et les routes SSR n'y répondent pas. Préférer la cible `prod` pour mesurer, et `local` pour comparer avant/après dans les mêmes conditions.
- `lighthouse` n'est pas une dépendance : `npx` le télécharge. La recherche de Chrome ne connaît que les chemins Windows. Sur macOS et Linux, le script s'appuie sur le chrome-launcher de Lighthouse.
- Compléments sans Lighthouse : `node scripts/audit/js-weight.mjs` (poids JS initial par page, lit `.vercel/output/static` après `npm run build`) et `scripts/audit/visual-snapshots.mjs` (captures et poids des images reçues, écrit dans `temp/visual/`). Lire leur en-tête pour les options.

## Lancer

```bash
node scripts/audit/lighthouse-runner.mjs --target=$ARGUMENTS   # local ou prod
```

Effets :
- écrit et supprime des rapports temporaires dans `temp/`, avec un profil Chrome dans `temp/chrome-profile` ;
- **réécrit `src/data/lighthouse-results.json`** (versionné), lu par `/admin/qualite/performance`.

## Analyser

- Lire `summary` (moyennes performance, accessibilité, bonnes pratiques, SEO) puis `results[]` : `scores` et `metrics.lcp`, `cls`, `tbt`, `fcp`, `ttfb`, `totalBytes`. Les entrées avec `error` sont des pages qui ont échoué.
- Comparer avec le `git diff` du JSON pour voir l'évolution depuis le dernier audit committé.
- Avant de proposer un correctif, vérifier les règles existantes :
  - `.claude/rules/images-pipeline.md` : `f_jpeg`, miniatures, dimensions, eager/lazy ;
  - `.claude/rules/sky-map.md` : hydratation de Stellarium.
  - Le coût CPU du WASM sur `/carte-du-ciel` est un « won't fix » assumé (voir l'archive `docs/audits/2026-05-performance-audit.md` §16.5).
- Pour un diagnostic page par page (traces, chaînes réseau), la skill `web-perf` (Chrome DevTools) complète cet audit.
- Ne committer le JSON que si l'utilisateur veut garder la mesure.
