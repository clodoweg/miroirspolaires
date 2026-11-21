# Miroirs Polaires

Site personnel d'astrophotographie, de récits de voyage et d'outils d'astronomie : https://www.miroirspolaires.fr

## Fonctionnalités

- **Galerie d'astrophotographies** générée à partir d'un export AstroBin, avec annotations, cartes de repérage et descriptions issues de Wikipédia.
- **Carte du ciel interactive** fondée sur le moteur Stellarium Web compilé en WebAssembly.
- **Outils d'observation** : étoiles variables (AAVSO VSX + distances Gaia DR3), exoplanètes, comètes et astéroïdes, catalogues (Messier…), explorateur d'objets et recommandations de cibles pour la nuit (hauteur, masse d'air de Pickering, créneaux où le soleil est sous -12°).
- **Récits de voyage, blog et vidéos** en Markdown, avec galeries masonry et photosphères 360°.
- **Boutique** (activable) : vente du livre avec paiement Stripe Checkout et choix d'un point relais Mondial Relay.
- **Administration locale** (en développement uniquement) : éditeurs d'articles et de voyages, gestion R2, console de scripts en direct, tableau de bord Lighthouse.

## Stack

| Couche | Choix |
|---|---|
| Framework | Astro 7 (statique + routes SSR), adaptateur Vercel |
| UI | React 19, TypeScript 5 |
| Styles | Tailwind CSS 4 (`@tailwindcss/vite`) + `@tailwindcss/typography` |
| Données | Turso (libSQL) pour les catalogues astronomiques, JSON versionnés dans `src/data/` |
| Images | Cloudflare R2 + Cloudflare Worker de redimensionnement (Photon WASM) |
| Tests | Vitest 5 + happy-dom + Testing Library, couverture v8 |
| Qualité | ESLint 10 (flat config, `eslint.config.js`), Prettier 3 (`.prettierrc.json`) |

## Prérequis

- Node.js **22.23.4 ou plus** (minimum exigé par Astro 7.4, voir `engines` dans `package.json` ; `.nvmrc` fixe Node 24, utilisé par la CI)
- npm
- Une base Turso : le build en a besoin, car certaines routes API sont prérendues.
- Facultatif : un accès au bucket R2 pour récupérer les images. Elles ne sont pas dans git.

## Installation

```bash
git clone https://github.com/clodoweg/miroirspolaires.git
cd miroirspolaires
npm install
# créer .env (voir ci-dessous)
npm run dev          # http://localhost:4321
```

Pour travailler hors ligne avec les images en local : les télécharger une fois avec `node scripts/r2/download_r2_to_local.js` (identifiants R2 requis, dont `R2_BUCKET_NAME`), puis mettre `FORCE_LOCAL_IMAGES=true`. Ne pas utiliser `--skip-raw` dans ce cas : les pages d'astrophotos ont besoin des fichiers bruts.

## Variables d'environnement

À définir dans `.env` (git-ignoré) et dans le projet Vercel. La liste ne donne que les noms.

| Groupe | Variables |
|---|---|
| Turso (requis) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Images | `PUBLIC_R2_URL`, `IMAGE_WORKER_URL`, `FORCE_LOCAL_IMAGES` / `PUBLIC_FORCE_LOCAL_IMAGES`, `PUBLIC_EAGER_LOAD_COUNT`, `PUBLIC_GALLERY_FULL_RENDER_COUNT` |
| R2 (scripts et admin) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_URL` (repli historique) |
| Worker | `IMAGE_WORKER_PURGE_KEY` (purge et préchauffage). Le worker lui-même utilise le secret `PURGE_KEY` et le binding `BUCKET`. |
| Boutique | `ENABLE_BOUTIQUE` / `PUBLIC_ENABLE_BOUTIQUE` (`true` pour l'activer), `STRIPE_SECRET_KEY`, `PUBLIC_MONDIAL_RELAY_BRAND_ID` (marque de test `BDTEST13` par défaut) |
| Services | `PUBLIC_UMAMI_WEBSITE_ID`, `PUBLIC_UMAMI_SCRIPT_URL`, `PUBLIC_WEB3FORMS_ACCESS_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` |

`VERCEL_ENV` est fourni par Vercel : les déploiements de preview sont en `noindex`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement, admin sur `/admin` |
| `npm run build` | Build de production (sortie `.vercel/output/`) |
| `npm run preview` | Peu fiable avec l'adaptateur Vercel : il sert `dist/`, alors que le client est dans `dist/client`, et les routes SSR n'y répondent pas. |
| `npm run typecheck` | `astro check` : vérification TypeScript et Astro (0 erreur exigée) |
| `npm run lint` / `npm run lint:fix` | ESLint (0 erreur exigée ; les avertissements ne bloquent pas) / correction automatique |
| `npm run format` / `npm run format:check` | Prettier : reformate / vérifie sans écrire |
| `npx vitest run` | Suite de tests (une passe) |
| `npm test` | Tests en mode watch |
| `npm run test:coverage` | Couverture v8 avec seuils (80 % lignes, fonctions et instructions, 70 % branches) sur `src/lib`, `src/utils`, `src/config` et `src/pages/api` (`vitest.config.ts`) |
| `npm run update-exoplanets`, `update-variable-stars`, `crossmatch-gaia`, `check-variable-stars` | Mise à jour ou diagnostic des tables Turso |
| `npm run sync-asset-years` | Réaligne les dossiers d'année des astrophotos sur le CSV (`-- --dry-run` pour simuler) |

## Structure

```text
data/                    export AstroBin (CSV), source des astrophotos
docs/                    architecture, style guide, audits archivés
public/                  polices, moteur Stellarium (js/), Pannellum, favicons
scripts/
  audit/                 Lighthouse, couverture R2 et SEO, poids JS, captures visuelles
  build/                 dimensions d'images, miniatures, lastmod du sitemap
  db/                    schéma et index Turso
  lib/                   helpers partagés : .env, client R2, client Turso, lecture des options
  pipeline/              nouvelle astrophoto, minis, imports de données astronomiques
  r2/                    upload, téléchargement, suppression, purge et préchauffage du cache
  seo/                   temps de lecture, données et descriptions Wikipédia
  stellarium/            compilation du moteur Stellarium Web
src/
  assets/                images (seuls a-propos/, index/, observatoires/ et videos/ sont versionnés)
  components/            composants Astro et React
  content/               blog, voyages, vidéos (Markdown)
  data/                  JSON générés (alt, SEO, dimensions, Lighthouse…)
  layouts/  lib/  pages/  plugins/  styles/  utils/
workers/image-resizer/   Cloudflare Worker de redimensionnement
```

Le détail technique est dans `docs/architecture.md`, les classes et tokens dans `docs/style-guide.md`.

## Scripts de maintenance

Ils se lancent depuis la racine avec `node`, ou depuis `/admin/scripts` en développement. **Plusieurs sont destructifs** : lire l'en-tête du script avant de le lancer. Les scripts R2 destructifs refusent toute option inconnue et acceptent `--dry-run`.

- `scripts/pipeline/update-photos.mjs` (bouton de `/admin/astrophotos`) : importe depuis le dépôt `astrobin`, génère miniatures et alts, envoie sur R2, puis met à jour dimensions et versions web. `--dry-run` disponible. `update-content.mjs --scope=blog|voyages` fait de même pour le blog et les voyages.
- `scripts/pipeline/generate-mini.mjs [--force]` : versions de 1600 px dans `mini/`.
- `scripts/build/compute-image-dimensions.mjs [--only=astro,voyages,blog,videos] [--force-r2]` : met à jour `src/data/image-dimensions.json`. À lancer après tout ajout d'image : les images R2 sont absentes du build, et c'est ce fichier qui évite les décalages de mise en page.
- `scripts/build/regen-thumbs.mjs [--force] [--upload]` : miniatures `-thumb.jpg` des couvertures.
- `scripts/r2/upload_local_to_r2.js [dossier] [-f] [--delete-first] [--dry-run]` : incrémental par défaut, n'envoie que les fichiers absents de R2 (`-i` est accepté mais inutile). `-f` réécrit aussi les existants. **`--delete-first` vide le préfixe R2 avant de tout réenvoyer** (miroir, refusé si le dossier local manque) : le lancer d'abord avec `--dry-run`.
- `scripts/r2/download_r2_to_local.js [préfixe] [-s|--skip-raw] [-f|--force]`
- `scripts/r2/delete-dirs.mjs [préfixes…] [--dry-run]` : **sans préfixe, supprime `a-propos/`, `index/`, `observatoires/` et `videos/` du bucket**, sans confirmation. `--dry-run` liste ce qui serait supprimé.
- `scripts/r2/purge-cache.mjs [dossier|all]`, `warm-cache.mjs [préfixe|all]` : purge et préchauffage du cache du worker.
- Dans `/admin/scripts`, « Sync R2 » (`sync-r2`) est incrémental ; seule l'entrée `mirror-r2` (case « Delete first ») lance `--delete-first`.
- `scripts/seo/blog-metadata.js` (temps de lecture), `wiki-descriptions.js` et `astro-details.mjs` (Wikipédia). Ils écrivent dans `src/data/`. Les alts et descriptions SEO manquants s'écrivent via Claude Code : `/generate-alts` et `/generate-seo`.
- `scripts/audit/lighthouse-runner.mjs [--target=local|prod]` : 17 pages, la **production par défaut**. Le résultat va dans `src/data/lighthouse-results.json`.
- `scripts/audit/r2-coverage.js`, `seo-coverage.mjs` : rapports en lecture.
- `scripts/db/init-db.mjs` : **supprime et recrée** les tables Turso. `scripts/db/create-indexes.mjs [--check]` : index de `variable_stars`.

## Contenu

- **Astrophotographie** : dans le dépôt `astrobin`, lancer `python3 scrape_astrobin.py --incremental`, qui copie le résultat ici. Cliquer ensuite sur « Mettre à jour les photos » dans `/admin/astrophotos`, puis écrire les descriptions SEO signalées avec `/generate-seo astro`.
- **Voyage ou article** : passer de préférence par l'éditeur `/admin/voyages` ou `/admin/blog` en développement. À la main, les fichiers sont `src/content/voyages/<année>/<slug>.md` ou `src/content/blog/<année>/<slug>.md`, avec les images dans `src/assets/<voyages|blog>/<année>/<slug>/`. Le schéma du frontmatter est dans `src/content.config.ts`. Exemples : `src/content/voyages/2026/le-sud-de-la-norvege.md`, `src/content/blog/2026/la-route-des-fjords.md`.

## Images

Les originaux et les miniatures sont sur Cloudflare R2 (`pub-r2.miroirspolaires.fr`). Les variantes redimensionnées passent par le worker `workers/image-resizer` (`images.miroirspolaires.fr`), sous la forme `/w_800,q_80,f_jpeg/<chemin>`.

- Le worker sert du JPEG, car Photon ne produit que du WebP sans perte, bien plus lourd.
- Il sert l'original sans traitement au-delà de 500 Ko ou 1,8 MP, ainsi que les miniatures (`mini/`, `-thumb.jpg`).
- Les variantes sont mises en cache à l'edge Cloudflare.
- La purge exige l'en-tête `x-purge-key` égal au secret `PURGE_KEY` du worker : sans secret configuré, elle est refusée (401).
- Déploiement du worker : `cd workers/image-resizer && npx wrangler deploy` (secret : `npx wrangler secret put PURGE_KEY`, même valeur que `IMAGE_WORKER_PURGE_KEY`).

## Déploiement

Le projet est hébergé sur Vercel (`@astrojs/vercel`). Configurer les variables d'environnement ci-dessus dans le projet Vercel, au minimum Turso. Les en-têtes de sécurité (CSP, `X-Frame-Options`, COOP, etc.) sont ajoutés au build par `src/integrations/security-headers.mjs`. L'administration ne répond qu'en développement et sur la Preview Vercel de la branche `dev` (login GitHub, voir `docs/admin-distant.md`) : en production, `/admin` et `/api/admin/*` renvoient 404.

## Intégration continue

`.github/workflows/ci.yml` tourne sur chaque push et pull request vers `dev` et `main` (Node de `.nvmrc`, `npm ci`) : `format:check`, `lint`, `typecheck`, `vitest run --coverage` (seuils ci-dessus), puis `npm run build` si les secrets `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` sont définis dans le dépôt (sinon l'étape est sautée avec un avertissement). Les workflows manuels `update-exoplanets.yml` et `update-variable-stars.yml` mettent à jour Turso.

## Développement avec Claude Code

`CLAUDE.md` et `.claude/` (rules, skills, agent `code-reviewer`, permissions) décrivent les conventions du projet pour l'agent. Le hook Stop `.claude/hooks/verify-on-stop.sh` (déclaré dans `.claude/settings.json`) relance `astro check` et `vitest run` quand du code a changé depuis la dernière vérification réussie, et renvoie les erreurs à l'agent (deux blocages consécutifs au plus). Il ne lance ni le lint ni le build : le skill `/verify` reste à faire avant un commit.

## Licence

- **Code** : licence MIT, voir [`LICENSE`](LICENSE).
- **Contenu** (photographies, vidéos, textes, nom et logo Miroirs Polaires) : © Clodoweg, tous droits réservés, voir [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md).
- **Composants tiers** (Stellarium Web Engine sous AGPL-3.0, Aladin Lite, Pannellum, polices, données) : chacun sous sa propre licence, voir [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
