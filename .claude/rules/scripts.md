---
paths:
  - "scripts/**"
  - "src/lib/admin/scripts.ts"
---

# Scripts Node

- Lancer depuis la racine du dépôt : `r2-coverage.js` y écrit `missing_r2_upload.txt`, `compute-image-dimensions.mjs` y lit le `.env` et les scripts `stellarium/` y résolvent leurs chemins. Les autres chargent le `.env` de la racine via `loadEnv()`.
- Helpers partagés dans `scripts/lib/` : `astrobin-import.mjs` (plan d'import, photos incomplètes), `alt-coverage.mjs` (alts depuis le CSV), `wiki-intro.mjs` (introduction Wikipedia), `env.mjs` (`PROJECT_ROOT`, `loadEnv()`), `pipeline-runner.mjs` (enchaînement des étapes, relais de l'arrêt), `r2.mjs` (`requireR2Config()`, `createR2Client()`), `r2-staging.mjs` (envoi sous `incoming/` puis copie vers les clés définitives), `worker-cache.mjs` (purge du cache du worker), `turso.mjs` (`createTursoClient()`), `args.mjs` (`parseCliArgs()`). Les scripts peuvent importer un module `.ts` de `src/lib/` sans alias `@/` (Node efface les types), comme `constellation-from-coords.ts`. `LOCAL_ONLY_DIRS` vient de `src/config/imageConfig.mjs`.
- En-tête obligatoire dans tout script nouveau ou modifié : responsabilité, **toutes** les options et des exemples (modèle : `scripts/pipeline/migrate-asset-years.mjs`). Mettre l'en-tête à jour quand une option change.
- Les arguments se lisent depuis `process.argv.slice(2)` ; préférer `parseCliArgs()` (refuse les options inconnues). Pas de nouvelle dépendance CLI.
- En cas d'échec : `process.exit(1)`. L'admin s'appuie sur le code de sortie.
- Tout nouveau script destructif doit offrir `--dry-run`, lu par `parseCliArgs()`.
- Client R2 : `requireR2Config()` + `createR2Client()` ; client Turso : `createTursoClient()` ; `.env` : `loadEnv()`. Ne pas recréer ces clients ni appeler `dotenv` à la main dans un nouveau script. Tests de ces helpers : `scripts/lib/*.test.mjs`.

## Effets de bord : ne pas lancer sans demande explicite

| Script | Effet |
|---|---|
| `pipeline/update-photos.mjs` | Bouton de `/admin/astrophotos/importer` (`AstroImportPanel.tsx` : `update-photos` en local, `update-photos-ci[-force]` à distance). Importe depuis le dépôt `astrobin` (`ASTROBIN_DIR`, défaut `../astrobin`), puis enchaîne miniatures, alts (depuis le CSV), descriptions Wikipedia, envoi R2 (`--changed`), dimensions et versions web. Signale les SEO manquantes. Ne supprime rien sur R2. `--dry-run` disponible. **`--ci`** (GitHub Actions) : lance aussi le scrape AstroBin (`--incremental --check-r2 --no-sync`), ne traite que les nouvelles photos, envoie tout sous `incoming/astro/<run>/` puis copie vers les clés définitives si tout est passé, ajoute au manifeste `web-images.json` sans rien retirer et contrôle le bilan sur R2. `--ci --force-media` : retélécharge tous les médias et remplace sur R2 ceux dont le contenu a changé. |
| `pipeline/update-content.mjs --scope=blog\|voyages` | Boutons de `/admin/blog/images` et `/admin/voyages/images`. Pour ce seul domaine : temps de lecture (blog), envoi R2 (`--changed`), dimensions, versions web et signalement des alts et SEO manquants. Ne supprime rien sur R2. `--dry-run` disponible. |
| `r2/upload_local_to_r2.js [dir]` | Par défaut : n'envoie que les fichiers absents de R2 (`-f` : réécrit aussi les existants ; `--changed` : réécrit ceux dont le contenu diffère). **`--delete-first` : vide le préfixe R2 puis réenvoie** (refusé si le dossier local manque). Sans dossier, touche `astrophotographies/`, `blog/` et `voyages/`. `--dry-run` disponible ; option inconnue = refus. |
| `r2/delete-dirs.mjs [préfixes…]` | Supprime des préfixes R2, sans confirmation (`--dry-run` pour lister d'abord). |
| `r2/purge-cache.mjs [dir\|all]` | Purge le cache du worker (défaut `astrophotographies`), seulement pour les fichiers présents en local, variantes `IMAGE_CONFIG.CACHED_VARIANTS`. |
| `r2/download_r2_to_local.js [préfixe] [-s] [-f]` | Écrase les fichiers locaux de taille différente. |
| `build/regen-thumbs.mjs --upload` | Réécrit les miniatures sur R2. |
| `build/generate-web-images.mjs --upload` | Envoie sur R2 (préfixe `web/` seulement) les versions web absentes (`--force` : les réécrit) et réécrit `src/data/web-images.json`. Sans `--upload` : local seulement (`temp/web-images/`). `--dry-run`, `--only=astro,blog,voyages`, `--prefix=<dossier>` (un seul article ou voyage ; seules ses entrées du manifeste sont remplacées), `--purge` (cache du worker des sources traitées). Entrée `refresh-web-images` de l'admin : `--force --upload --purge` sur un dossier. |
| `pipeline/update-exoplanets.mjs`, `update-comets.mjs`, `update-asteroids.mjs` | `DELETE` de la table Turso puis réimport. |
| `pipeline/update-variable-stars.mjs` | `DELETE` par défaut s'il n'y a pas de `scripts/pipeline/import-progress.json`. `--fresh`, `--no-clean`, `--max-mag <n>` (défaut 25). |
| `pipeline/crossmatch-variable-stars.mjs --reset` | Vide `variable_stars_gaia`. |
| `db/init-db.mjs` | **`DROP` des 5 tables Turso.** |
| `seo/blog-metadata.js` | Écrit les temps de lecture manquants dans `src/data/blog.json`, sans appel externe. |
| `seo/wiki-descriptions.js`, `seo/astro-details.mjs` | Lisent Wikipedia et écrivent dans `src/data/`. Le texte de `wiki-descriptions.js` est repris tel quel (CC BY-SA) : garder le lien vers la source. |

`admin/run-admin-job.mjs` n'est lancé que par `.github/workflows/admin-job.yml` (jobs de l'admin distant) : il exécute une entrée `remote: true` de `SCRIPTS` et écrit son journal dans Turso (`admin_jobs`, `admin_job_logs`).

Sans effet distant : `pipeline/check-variable-stars.mjs`, `audit/seo-coverage.mjs`, `build/compute-image-dimensions.mjs` (écrit seulement le JSON local), `pipeline/migrate-asset-years.mjs --dry-run`, `db/create-indexes.mjs --check`.

Écrivent des fichiers versionnés ou locaux : `build/update-catalogue-snapshots.mjs` (`src/data/catalogues/`, lit le CDS ou ses miroirs selon `src/data/upstream-priority.json` ; boutons dans `/admin/donnees/catalogues`), `audit/lighthouse-runner.mjs` (`src/data/lighthouse-results.json`), `pipeline/migrate-asset-years.mjs` (déplace des fichiers, réécrit `alt.json`), `pipeline/generate-mini.mjs`, `stellarium/build.sh` (`public/js`, `public/data`). Réseau seulement : `r2/warm-cache.mjs`.

## Pièges connus

- Dans `src/lib/admin/scripts.ts`, `sync-r2` et `upload-missing-r2` sont incrémentaux ; seule `mirror-r2` (`--delete-first`) vide R2.
- Les options se lisent avec `parseCliArgs()` (`scripts/lib/args.mjs`), qui refuse toute option inconnue : un `--dry-run` mal saisi ne doit jamais lancer l'action réelle.
- `R2_BUCKET_NAME` est obligatoire : aucun script ni route admin n'a de bucket par défaut.
- URL publique R2 : `PUBLIC_R2_URL`.
- `build/sitemap-lastmod.mjs` est un module importé par `astro.config.mjs`, pas une CLI.
- WARNING: une page admin rechargée coupe sa connexion et tue le script qu'elle a lancé. `quiet-pipeline-data.mjs` et `vite.server.watch.ignored` (`astro.config.mjs`) évitent ces rechargements : tout nouveau fichier écrit par un script et importé par le site doit y figurer.
- `build/hero-mosaic.mjs` réécrit `src/assets/index/hero-*.jpg` (versionnés) à partir d'une liste d'images codée en dur.
