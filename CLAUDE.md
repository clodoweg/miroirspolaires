# Miroirs Polaires

Site personnel d'astrophotographie, de récits de voyage et d'outils d'astronomie (https://www.miroirspolaires.fr).
Astro statique déployé sur Vercel, images sur Cloudflare R2 via un worker de redimensionnement, données astronomiques sur Turso.
Une interface d'administration React tourne en `npm run dev` et sur la Preview Vercel de la branche `dev` (login GitHub, enregistrements committés sur `dev`).

## Stack

- Astro 7 (`output: 'static'` + `@astrojs/vercel`, routes SSR via `export const prerender = false`)
- React 19, TypeScript 5 (strict, alias `@/*` → `src/*`)
- Tailwind CSS 4 via `@tailwindcss/vite` + `@tailwindcss/typography` (`@plugin`) ; tokens JS chargés par `@config` dans `src/styles/base.css`
- Vitest 5 + happy-dom 21 + Testing Library (seuils de couverture dans `vitest.config.ts`)
- Turso / libSQL (`@libsql/client`, SQL brut), Cloudflare R2 (`@aws-sdk/client-s3`), Worker Photon (`workers/image-resizer/`)
- Node >= 22.23.4 (exigé par Astro 7.4) ; `.nvmrc` fixe Node 24 pour la CI

## Commandes

```bash
npm run dev                         # http://localhost:4321, admin sur /admin
npm run build                       # exige TURSO_DATABASE_URL (routes API prérendues)
npx astro check                     # 0 erreur exigée
npx vitest run                      # toute la suite (npm test = mode watch)
npx vitest run src/lib/photos.test.ts   # un fichier
npx vitest run -t "nom du test"     # un test par nom
node scripts/build/compute-image-dimensions.mjs [--only=astro,voyages,blog,videos] [--force-r2]
node scripts/build/regen-thumbs.mjs [--force] [--upload]
node scripts/build/generate-web-images.mjs [--dry-run] [--upload] [--only=astro,blog,voyages]   # versions web 400/800/1200 sur R2
node scripts/audit/lighthouse-runner.mjs [--target=local|prod]   # prod par défaut
```

Scripts npm de données (écrivent dans Turso) : `update-exoplanets`, `update-variable-stars`, `crossmatch-gaia`, `check-variable-stars` (lecture seule), `sync-asset-years` (`-- --dry-run`). `update-catalogues` (`-- --missing`, `-- --only=messier`) écrit les instantanés de `src/data/catalogues/`, sans toucher Turso.

## Carte des dossiers

- `src/pages/` — routes publiques, `admin/` et `api/admin/**` (dev et Preview de `dev`), `api/auth/` (login admin). Pages de l'admin rangées par section (`donnees/`, `qualite/`, `infra/`, `publication/`) d'après le registre `src/config/admin-sections.ts`
- `src/components/` — composants Astro/React par domaine (`Admin/`, `SkyMap/`, `Objects/`, `Gallery/`, `Shop/`, `UI/`…)
- `src/layouts/` — `BaseLayout.astro` (thème, polices, ClientRouter), `AdminLayout.astro`
- `src/lib/` — logique métier : `db.ts` (Turso), `photos.ts` (CSV astrophotos), `admin/`, `objects/`, `catalogues/`, `theme.ts`
- `src/config/` — `imageConfig.mjs`, `navigation.ts`, `shop.ts` (catalogue et transporteurs de la boutique)
- `src/utils/` — `imageService.ts` (résolution R2/worker), `seo.ts`, `constants.ts`
- `src/plugins/` — plugins rehype
- `src/content/` — collections `blog/` et `voyages/` (`<année>/<slug>.md`), `videos/` (`<slug>.md`, sans année) ; schémas dans `src/content.config.ts`
- `src/data/` — JSON générés et versionnés (alt, seo, dimensions d'images, Lighthouse…)
- `src/styles/` — `base.css` (variables de couleur), `design-tokens.ts`, `fonts.css`
- `src/assets/` — images ; seuls `a-propos/`, `index/`, `observatoires/`, `videos/` sont versionnés
- `data/` — `astrobin_clodoweg_gallery_python.csv`, source des astrophotos (export AstroBin)
- `scripts/` — `pipeline/`, `r2/`, `seo/`, `build/`, `audit/`, `db/`, `stellarium/`
- `workers/image-resizer/` — Cloudflare Worker (déployé à part avec wrangler)
- `public/js/` — moteur Stellarium Web (`.js` + `.wasm`) ; ses données sont dans `public/data/`
- `docs/` — architecture, style guide, audits archivés

## Pièges non évidents

- Images R2 absentes en CI : après ajout ou modification d'image ou de frontmatter, lancer `compute-image-dimensions.mjs` et committer `src/data/image-dimensions.json`, sinon pas de width/height, donc CLS et images écrasées.
- `rehypeProbeDimensions` doit rester avant `rehypeMasonry` dans `astro.config.mjs` : masonry recopie les dimensions dans le `<picture>` qu'il génère.
- Toujours demander `f_jpeg` au worker. Photon ne sait produire que du WebP sans perte (environ 5× plus lourd), donc le worker sert du JPEG même si on demande `f_webp` : écrire `f_webp` crée seulement une clé de cache inutile.
- Le worker sert l'original sans redimensionner au-delà de 500 Ko ou 1,8 MP (limite CPU du plan gratuit) : pour les listings, utiliser `-thumb.jpg` (`toThumbUrl()`) ou `mini/`. Les versions web (`generate-web-images.mjs --upload`, manifeste `src/data/web-images.json`) remplacent automatiquement worker et `mini/` pour les images qui en ont : relancer le script après un ajout d'images.
- `ResponsiveImage.astro` sert les `-thumb.jpg` directement depuis R2 (`isPresizedThumb`) : ne pas les repasser par le worker, qui les ré-encoderait une seconde fois (q80 desktop, q60 mobile).
- Carte du ciel : `StellariumMapContainer` en `client:idle` et `StaticSkyMap` en `client:visible`, jamais `client:load` (WASM + init CPU lourde, TBT). `BaseLayout.astro` force une navigation complète vers `/carte-du-ciel` : ne pas retirer ce script.
- `/admin/*` et `/api/admin/*` répondent en `npm run dev` et sur l'**admin distant** (Preview Vercel de la branche `dev`, login GitHub, enregistrements par commit sur `dev` via `getContentWriter()` ; photos envoyées directement sur R2 (`remote-images.ts`) ; mise en production `dev` → `main` depuis `/admin/publication`, écritures journalisées et plafonnées (`audit-log.ts`) ; scripts `remote: true` lancés dans GitHub Actions (`jobs.ts`, `admin-job.yml`) ; voir `docs/admin-distant.md`). La production renvoie toujours 404. `prerender = false` obligatoire ; les pages testent `isAdminGranted(Astro.locals)`, les routes API appellent `requireAdmin(locals)` (`src/lib/admin/auth/access.ts`). À distance, seules les routes de `src/lib/admin/remote-capabilities.ts` répondent (501 sinon). Ne jamais lier `/admin` depuis le site public : le menu « Admin » de la barre de navigation (`getAdminNavItem`, `src/config/navigation.ts`) n'existe qu'en `npm run dev` et dans le build de la Preview de `dev`.
- `FORCE_LOCAL_IMAGES=true` (ou `PUBLIC_FORCE_LOCAL_IMAGES`) fait résoudre les images depuis `src/assets/` au lieu de R2.
- `src/assets/.gitignore` exclut les images sauf `LOCAL_ONLY_DIRS`. Un nouveau dossier versionné doit être ajouté à `LOCAL_ONLY_DIRS` (`src/config/imageConfig.mjs`, source unique pour le site, l'admin et les scripts).
- Couleurs : les variables `--color-mp-*` sont dans `src/styles/base.css` (`:root` clair par défaut, `html.dark`). `themeTokens` n'en est qu'une copie, et `src/lib/theme.ts` n'expose que la palette claire.
- Les astrophotos ne sont pas une content collection : tout vient du CSV `data/…csv` (pages, années de dossier, SEO).
- Plusieurs scripts R2 ou Turso sont destructifs : `delete-dirs.mjs`, `upload_local_to_r2.js --delete-first` (entrée `mirror-r2` de l'admin), les imports Turso. Lire `.claude/rules/scripts.md` avant d'en lancer un.
- Catalogues du ciel profond : le site lit `src/data/catalogues/<slug>.json` et n'interroge le CDS (`fetchCatalogueEntriesLive`) que pour un catalogue sans instantané. Modifier une requête ou la normalisation dans `src/lib/catalogues/fetch.ts` ne change rien au site tant que `npm run update-catalogues` n'a pas été relancé et son résultat committé.
- CDS (SIMBAD, VizieR, Sesame, hips2fits, Aladin) : toujours passer par les routes de `src/config/upstream-routes.ts` (`querySimbadTap`, `queryVizierTable` de `src/lib/upstream/clients.ts`, `withUpstreamFailover`), jamais par une URL en dur. L'ordre choisi dans `/admin/donnees/routes-cds` est écrit dans `src/data/upstream-priority.json` et n'atteint la production qu'une fois committé. Les miroirs VizieR passent par ASU : une colonne absente répond 200 sans données, d'où l'erreur levée par `parseAsuTsv`.
- La CSP est posée par `src/integrations/security-headers.mjs` (pas par `vercel.json` ni `public/_headers`, ignorés avec l'adaptateur). Toute nouvelle ressource externe chargée par le navigateur doit être ajoutée à `CSP_DIRECTIVES`, sinon elle est bloquée en production. Pas de gestionnaire inline (`onerror="…"`, `onclick`) ni d'URL `javascript:` : le build échoue (`script-src` sans `'unsafe-inline'`, empreintes des scripts inline calculées au build, voir `docs/architecture.md`).

## Standards de code

- Noms explicites (`isPresizedThumb`, `getLocalImageDimensions`), pas d'abréviations opaques.
- Ne pas commenter le « quoi ». Commenter le pourquoi avec `// POURQUOI : …` (forme dominante du dépôt).
- `WARNING:` en tête de commentaire sur le code sensible : sécurité, performance critique, effet destructif.
- JSDoc (description, `@param`, `@returns`) sur les fonctions exportées non triviales.
- Nouveau fichier : en-tête décrivant sa responsabilité. Nouveau script : en-tête avec toutes les options et des exemples d'utilisation (modèle : `scripts/pipeline/migrate-asset-years.mjs`).
- `TODO: [Action]` pour le travail en attente.
- Commentaires en français. Le code existant mélange français et anglais : ne pas retraduire.
- Styles : classes Tailwind et tokens `mp-*` uniquement (voir `.claude/rules/styling.md`).
- Si une logique commentée change, mettre le commentaire à jour.

## Workflow

- Avant de conclure : `npx astro check` (0 erreur) et `npx vitest run`. Si le pipeline d'images, les plugins ou la config Astro/Tailwind sont touchés, lancer aussi `npm run build`. Le skill `/verify` enchaîne ces contrôles et produit le rapport.
- Commit : messages en anglais, à l'impératif, préfixés `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `style:`, `test:`.

## Pour aller plus loin

- `docs/conception-boutique.md` : conception de la boutique (Stripe Checkout, Mondial Relay).
- `docs/admin-distant.md` : admin sur la Preview de `dev` (GitHub App, variables, phases à venir).
- `docs/architecture.md` : rendu, pipeline d'images, worker, plugins, carte du ciel, admin, Turso, problèmes connus.
- `docs/style-guide.md` : tokens, classes, typographie, thèmes.
- `docs/audits/2026-05-performance-audit.md` : archive historique, ne fait pas autorité.
- `.claude/rules/` se chargent automatiquement selon les fichiers ouverts. `.claude/skills/` contient les procédures (vérification, nouvelle astrophoto, voyage ou article, alts et SEO à écrire via `/generate-alts` et `/generate-seo`, audit perf, sync R2, données astro). Le subagent `code-reviewer` (`.claude/agents/`) relit un diff selon ces règles.
- `CLAUDE.local.md` (non versionné) : préférences personnelles.
