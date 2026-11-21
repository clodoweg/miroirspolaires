# Architecture — Miroirs Polaires

Détail technique sorti de `CLAUDE.md`. Le code fait foi : les numéros de ligne évoluent, cherchez les symboles cités.

## Rendu et hébergement

- Astro 7 en `output: 'static'` avec l'adaptateur `@astrojs/vercel` : tout est prérendu, sauf la quarantaine de fichiers de `src/pages/` qui déclarent `export const prerender = false` (admin, API dynamiques, `/recommandations`, `/objets`…). Ce sont des fonctions Vercel.
- `npm run preview` n'est pas fiable avec l'adaptateur Vercel : il sert `dist/`, alors que le client est dans `dist/client`, et les routes SSR n'y répondent pas. La sortie déployable est `.vercel/output/`.
- `prefetch: true`, `ClientRouter` (transitions de vue) dans `BaseLayout.astro`.
- Îlots lourds (outils, catalogues, `/objets`, `/recommandations`, boutique) en `client:idle` : leur contenu est rendu côté serveur, l'hydratation attend que le thread principal se libère. Aucun `client:load` dans `src/pages/`.
- `src/middleware.ts` : refuse (403) les requêtes inter-sites vers `/api/admin/**` et les POST inter-sites vers `/api/auth/**`, puis contrôle l'accès à l'admin (voir Administration).
- Intégrations : `react()`, `sitemap()` (sans `/admin` ni `/api`) dont `serialize` lit `buildLastmodMap()` (`scripts/build/sitemap-lastmod.mjs` : date du frontmatter, année des voyages, `Uploaded` du CSV), et `securityHeaders()` (voir plus bas).
- Tailwind CSS 4 : plugin Vite `@tailwindcss/vite` (`vite.plugins`), point d'entrée `src/styles/base.css` (`@config` vers `tailwind.config.mjs` pour les tokens de `design-tokens.ts`).
- `src/lib/db.ts` (client libSQL Turso) lève une exception à l'import si `TURSO_DATABASE_URL` manque. `api/asteroids.ts`, `api/comets.ts` et `api/exoplanets.ts` sont prérendus et importent `db`, comme les pages d'outils (une requête agrégée par page pour les statistiques d'en-tête) : **le build exige les variables Turso**.

## Modules partagés

À réutiliser plutôt que recopier (l'audit 2026-10 a supprimé les copies).

| Module | Contenu |
|---|---|
| `src/lib/api/http.ts` | Routes `src/pages/api/**` : `jsonResponse()`, `errorResponse()`, `internalErrorResponse()` (500 générique, détail dans les logs), lecture bornée des paramètres (`parseBoundedInt`, `parseNumberInRange`, `parseBoundedString`, `parseDateParam`), `escapeLikePattern()` ; `UPSTREAM_TIMEOUT_MS` (25 s TAP, 10 s résolutions unitaires) pour les appels CDS, NED, Sesame, Wikipédia |
| `src/lib/astro/time.ts`, `sun.ts`, `instrument.ts` | `DEG`, `julianDate()`, `dateFromJulian()` ; `sunEcliptic()` (Meeus simplifié) ; `getLimitMagnitude()`, `getLimitMagnitudePhoto()` |
| `src/lib/objects/orbits.ts` | Kepler, passage plan orbital → écliptique → équateur, magnitudes MPC et H-G, positions planétaires des simulateurs |
| `src/lib/objects/small-bodies.ts` | Faisabilité, visibilité, filtres et tri communs aux comètes et astéroïdes, classification des astéroïdes |
| `src/lib/objects/variable-stars.ts`, `exoplanets.ts` | Calculs purs des visualiseurs d'étoiles variables (phénomènes, phase, courbe de lumière) et de transits (éphémérides, SNR, faisabilité) |
| `src/lib/objects/nominatim.ts` | Client Nominatim de `/api/object/geocode` : User-Agent, une requête par seconde (429 au-delà de 3 s d'attente), cache mémoire 24 h, délai de 5 s, réponse validée |
| `src/lib/shop/checkout-validation.ts` | `parseQuantity()` (entier 1–10), `validateRelayPoint()` (champs typés et bornés pour les métadonnées Stripe) |
| `src/lib/admin/content-files.ts` | Chemins `<année>/<slug>`, liste des markdown, suppression d'une entrée, enregistrement d'image, communs à `blog-files.ts` et `voyages-files.ts` |
| `src/lib/admin/cross-site.ts` | `isCrossSiteRequest()` (Fetch Metadata, repli sur `Origin`), utilisé par `src/middleware.ts` |
| `src/utils/normalize.ts` | `foldAccents()`, `stripAccents()`, `normalizeForSearch()`, `normalizeCatalog()`, `slugify()` |
| `src/utils/workerUrl.ts` | `composeWorkerUrl()` et `DEFAULT_IMAGE_WORKER_URL`, sans dépendance serveur (utilisables dans un îlot) |
| `src/utils/seo.ts` | `toJsonLd()` : JSON-LD échappé pour `set:html` |
| `src/components/UI/SortIcon.tsx` | Icône de tri des tableaux |
| `src/components/Admin/editor/` | Parties communes des éditeurs blog et voyages : `Field`, `StatCard`, `EditorSidebar`, `preview.ts` (slug, réécriture des chemins d'images vers les routes admin), `useSidebarCollapsed`, `withAdminProviders`, et l'éditeur WYSIWYG `rich/` (voir Administration) |
| `src/components/Objects/{small-bodies,comets,asteroids,variable-stars,exoplanets}/` | Sous-composants des quatre visualiseurs (lignes, en-têtes, panneaux de détail, simulateurs) ; `small-bodies/` est partagé par comètes et astéroïdes |
| `scripts/lib/env.mjs`, `r2.mjs`, `turso.mjs`, `args.mjs` | Scripts : `PROJECT_ROOT` et `loadEnv()` ; `requireR2Config()` (pas de bucket par défaut) et `createR2Client()` ; `createTursoClient()` ; `parseCliArgs()` (refuse les options inconnues) |

## Contenu

- Collections (`src/content.config.ts`, loader glob `**/[^_]*.{md,mdx}`) :
  - `blog` : `src/content/blog/<année>/<slug>.md` ; requis `title`, `date` (chaîne), `categories[]`, `description`, `image` ; optionnels `seoDescription`, `showImage`, `draft`, `hideImageCaptions`.
  - `voyages` : `src/content/voyages/<année>/<slug>.md` ; requis `title`, `image` ; optionnels `date`, `description`, `gallery[]`, `country` (chaîne ou liste), `season` (`Hiver|Printemps|Été|Automne`), `year`, `draft`.
  - `videos` : `src/content/videos/<slug>.md` (sans dossier d'année) ; requis `title`, `date`, `image`, `videoUrl`, `description` ; optionnels `duration`, `categories`.
- Les astrophotos **ne sont pas** une collection : `src/lib/photos.ts` parse `data/astrobin_clodoweg_gallery_python.csv` (import `?raw`), complété par `src/data/filter_mapping.json` et `drafts.json`. Slug de page : `<slug(Title)>-<ID>`.
- Données générées et versionnées dans `src/data/` : `alt.json`, `seo.json`, `blog.json`, `wikipedia.json`, `astro_details.json`, `image-dimensions.json`, `lighthouse-results.json`.

## Images

### Stockage

- `src/assets/.gitignore` ignore `*.jpg *.svg *.png *.webp *.gif` sauf dans `a-propos/`, `index/`, `observatoires/`, `videos/` (`LOCAL_ONLY_DIRS`, exporté par `src/config/imageConfig.mjs`).
- `astrophotographies/`, `blog/`, `voyages/` vivent sur Cloudflare R2 (`pub-r2.miroirspolaires.fr`) et ne sont donc pas présents en CI Vercel.
- Astrophotos : `astrophotographies/<AAAA>/<ID>_raw.jpg`, `mini/<AAAA>/<ID>_raw.jpg` (1600 px, `generate-mini.mjs`), `annotations/<AAAA>/<ID>_annotation.svg`, `skyplots/<AAAA>/<ID>_finding_chart.png` et `<ID>_skyplot.jpg`. L'année est `Uploaded.slice(0, 4)` du CSV (`npm run sync-asset-years` réaligne).
- Blog et voyages : `src/assets/{blog,voyages}/<année>/<slug>/`, avec une miniature `<nom>-thumb.jpg` à côté de chaque couverture.

### Production des variantes

| Source | Sortie | Paramètres |
|---|---|---|
| Upload admin (`src/lib/admin/image-process.ts`, `compressImage()`) | full `.jpg` + `-thumb.jpg` | 2400 px q82 / 800 px q60, mozjpeg |
| `scripts/build/regen-thumbs.mjs` (rattrapage) | `-thumb.jpg` | 800 px q75 mozjpeg |
| `scripts/pipeline/generate-mini.mjs` | `mini/` | 1600 px, format d'origine |
| `scripts/build/generate-web-images.mjs --upload` | `web/<clé sans extension>-w<largeur>.jpg` (blog, voyages, `mini/`) + `src/data/web-images.json` | 400/800/1200 px (ou largeur de la source si elle est plus étroite), q75 mozjpeg |

**Versions web** (`src/utils/webImages.mjs`) : fichiers statiques servis directement par R2, sans worker. Le manifeste `src/data/web-images.json` (clé source → largeurs présentes sur R2, écrit seulement avec `--upload`) décide de la bascule ; une image absente du manifeste garde l'ancien chemin (worker ou fichier direct). Consommateurs : `ResponsiveImage.astro` (srcset R2 ; `webImages={false}` pour l'image principale d'une fiche astrophoto, qui garde sa `mini/` de 1 600 px), `rehype-masonry.mjs` (images des articles), `buildOptimizedUrl()` jusqu'à 1 200 px (au-delà, visionneuse en 2 400 px, le worker reste), `GalleryGrid` (cartes chargées au défilement, vignettes de la vue liste), `carte-du-ciel.astro` (`thumbnailUrl` des marqueurs) et `own-photos.ts`. Pour une `mini/`, la mini elle-même termine le srcset. Une image ajoutée par l'admin n'a pas de version web tant que le script n'a pas été relancé ; l'admin l'affiche en tête de ses pages (`WebImagesReminder`, route `/api/admin/web-images/status`) avec un bouton qui lance le script sur les dossiers concernés.

### Résolution d'URL (`src/utils/imageService.ts`)

- `resolveImage(path, useMini, version)` → `${PUBLIC_R2_URL}/<clé>` ; `buildOptimizedUrl()` → `${IMAGE_WORKER_URL}/w_<w>,q_<q>,f_jpeg/<clé>`, format composé par `composeWorkerUrl()` (`src/utils/workerUrl.ts`). Les îlots client (`PhotoMarkers.tsx`, `PhotoList.tsx`) ne peuvent pas importer `imageService.ts` (`process.env`, `import.meta.glob` eager de tous les assets) : ils appellent `composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, …)`.
- `toThumbUrl()` produit l'URL `-thumb.jpg` utilisée par les listings.
- `FORCE_LOCAL_IMAGES` ou `PUBLIC_FORCE_LOCAL_IMAGES` = `'true'` : résolution via `import.meta.glob` local, pas de requête R2, pas de srcset.
- En dev, les images blog/voyages passent par `/api/admin/images/...` et `/api/admin/voyages-images/...` (pas encore sur R2).
- Photosphères 360° : `src/scripts/photo-sphere.ts` les charge par `/api/r2-image/[...path]` (SSR, même origine, Pannellum étant bloqué en CORS sur mobile). La route n'accepte que `blog|voyages/<année>/<slug>/<fichier image>` (pas de `..`, extensions jpg/png/webp/avif), lit le disque en dev via `safeResolve()` et, sinon, **relaie le flux R2** sans le bufferiser (cache d'un an).
- `src/config/imageConfig.mjs` : largeurs `[400, 800, 1200]`, qualité 80 desktop / 60 mobile.

### Worker de redimensionnement (`workers/image-resizer/`)

- Cloudflare Worker TypeScript + `@cf-wasm/photon`, binding R2 `BUCKET` → `miroirspolaires-assets`, secret `PURGE_KEY`. Déploiement : `cd workers/image-resizer && npx wrangler deploy`.
- URL `/w_800,q_80,f_jpeg/<clé>` (repli `?w=&q=`). w/h ≤ 4000, q 1–100, pas d'agrandissement.
- **JPEG forcé** : Photon n'expose qu'un WebP sans perte (~5× plus lourd) ; une demande `f_webp` est servie en `image/jpeg`.
- **Miniatures** (`/mini/`, `-thumb.jpg`) : servies telles quelles depuis R2, sans Photon ; `buildOptimizedUrl()` renvoie d'ailleurs l'URL R2 pour elles.
- **Sources > 500 Ko ou > 1,8 MP** : original R2 servi tel quel (le plan gratuit Workers limite à 10 ms CPU, Photon ≈ 3 ms/MP). Le test des 500 Ko précède le décodage ; celui des 1,8 MP le suit. Ces réponses ne passent pas par `cache.put`. L'image source est libérée (`free()`) après `resize`.
- Logique pure dans `src/core.ts` (testée par Vitest), `src/index.ts` ne fait que l'orchestration Photon/R2/cache.
- CORS : origine comparée exactement à une liste (`new URL(origin).origin` dans un `Set`, plus de `startsWith`), `Vary: Origin`. La clé de cache est l'URL seule ; les en-têtes CORS sont ajoutés à la sortie (`withCors()`), y compris sur les réponses servies depuis le cache.
- Options : valeurs non numériques ramenées aux défauts, dimensions plafonnées à 4000, qualité bornée à [1, 100]. Seules `GET` et `HEAD` sont acceptées.
- Purge : en-tête `x-purge` + clé dans l'en-tête `x-purge-key` (jamais en query string), comparée en temps constant sur des empreintes SHA-256. **Fermée par défaut** : sans secret `PURGE_KEY`, toute purge répond 401.
- `ResponsiveImage.astro` détecte `-thumb.jpg` (`isPresizedThumb`) et sert directement R2, sans srcset, pour éviter un second ré-encodage par le worker (q80 desktop, q60 mobile).
- Purge et préchauffage : le cache du worker est indexé par URL complète. `scripts/r2/purge-cache.mjs` purge (en `GET`, le worker ignorant les `HEAD`) l'URL nue et toutes les variantes de `IMAGE_CONFIG.CACHED_VARIANTS` ; `warm-cache.mjs` préchauffe les variantes des srcset. Toute nouvelle combinaison largeur/qualité doit être ajoutée à `CACHED_VARIANTS`.

### Dimensions et CLS

- `scripts/build/compute-image-dimensions.mjs` (manuel, pas branché sur `build`) écrit `src/data/image-dimensions.json`, clés relatives à `src/assets/`. Sources : CSV, frontmatter + images inline de voyages et blog, frontmatter seul pour les vidéos ; sonde locale puis R2 (`PUBLIC_R2_URL`). Options `--force-r2`, `--only=astro,voyages,blog,videos`.
- Lecteurs : `getLocalImageDimensions()` (`imageService.ts`, utilisé par GalleryGrid, pages de détail, VoyagesEditor) et `rehype-probe-dimensions.mjs` (via `createRequire` : l'import JSON avec attribut cassait le déploiement Vercel).

## Plugins Markdown (`astro.config.mjs`)

Aucun plugin remark. `rehypePlugins`, dans cet ordre :

1. `rehypeProbeDimensions` — width/height depuis l'attribut existant, puis `image-dimensions.json`, puis sonde disque ; ignore les URL distantes.
2. `rehypeMasonry` — groupes d'images → grille `<picture>` ; recopie width/height (d'où l'ordre), légendes en `data-caption-safe-markup`, script de repli vers R2 si le worker échoue. Exclut les images 360°.
3. `rehypeImageLoading` — seule la 1re image du corps est `eager`, les suivantes `lazy` + `fetchpriority=low` ; réécrit `/assets/`. Images 360° (alt commençant par `360:` ou src contenant `#360`) → URL R2 directe pour Pannellum.
4. `rehypeFigure` — `<figure>` / `<figcaption>`.

## Carte du ciel

- `/carte-du-ciel` : `StellariumMapContainer` en `client:idle`. Le moteur (`public/js/stellarium-web-engine.{js,wasm}`, ~1,2 Mo de WASM, données dans `public/data/`, seul chemin lu : la copie `public/js/data/` a été supprimée) est injecté par `src/hooks/useStellariumEngine.ts`, avec `setTimeout(init, 400)` pour laisser passer le LCP et un patch `addEventListener` en `passive: false`.
- `BaseLayout.astro` force une navigation complète vers `/carte-du-ciel` sur `astro:before-preparation` : le canvas et le module WASM ne survivent pas au `ClientRouter`.
- Fiches astrophoto : `StaticSkyMap` en `client:visible`, conteneur `content-visibility: auto` + `contain-intrinsic-size: auto 400px`.
- `src/lib/stellarium-utils.ts` : conversions J2000 ↔ horizontales ; `src/lib/constellations.ts` : `getConstellationName()` (abréviations UAI → français).
- Reconstruction du moteur : `scripts/stellarium/build.sh` (Docker + Emscripten, clone dans `temp/stellarium-web-engine`). Il copie les données une seule fois dans `public/data/` et ne renomme plus `skycultures/western/index.json` (fichier demandé par le moteur), puis réapplique `french-names.cjs`.

## Administration (dev et Preview de `dev`)

- Modes (`src/lib/admin/auth/config.ts`) : `local` en `npm run dev` (sans login, disque) ; `remote` sur la Preview Vercel de la branche `dev` quand toute la configuration est présente (login GitHub, contenu lu par l'API GitHub, enregistrements committés sur `dev`) ; `disabled` partout ailleurs, production comprise. Détails et mise en place : `docs/admin-distant.md`.
- Middleware : `authorizeAdminRequest()` (`auth/access.ts`) vérifie la session signée (`auth/session.ts`, cookie HMAC de 12 h) et l'identifiant `ADMIN_GITHUB_USER_ID`, puis dépose `locals.adminAccess`. Sans session : page → `/api/auth/github/login`, API → 401. À distance, une route absente de `remote-capabilities.ts` répond 501. Réponses admin : `X-Robots-Tag: noindex` et `Cache-Control: private, no-store`.
- Login : `/api/auth/github/{login,callback,logout}` (`auth/login-flow.ts`, `auth/github-oauth.ts`) : OAuth utilisateur de la GitHub App avec état signé et PKCE ; le jeton utilisateur n'est pas conservé.
- Scripts à distance : `src/lib/admin/jobs.ts` (job Turso + `workflow_dispatch` de `.github/workflows/admin-job.yml`), `src/lib/admin/job-store.mjs` (SQL partagé avec le runner), `scripts/admin/run-admin-job.mjs` (exécution, journal, clôture) ; seules les entrées `remote: true` de `SCRIPTS` ; panneau `RemoteJobsPanel.tsx` sur `/admin/scripts`.
- Mise en production à distance : `src/lib/admin/github/release.ts` (comparaison `main...dev`, PR, CI résumée par `summarizeChecks`, fusion sur la tête attendue et CI verte) ; page `/admin/publication`. Journal et limitation des écritures distantes : `src/lib/admin/audit-log.ts` (table Turso `admin_audit_log`), appliqués par `src/middleware.ts`, page `/admin/journal`.
- Images à distance : `src/lib/admin/remote-images.ts` (R2 direct : liste, envoi présigné puis `finalize` avec compression, versions web et dimensions en métadonnées, couverture, suppression) ; `computeImageManifestChanges` met à jour `image-dimensions.json` et `web-images.json` dans le commit de l'article ou du voyage. Client : `editor/uploadImages.ts`.
- Écriture du dépôt : `ContentWriter` (`stores/content-writer.ts`), disque en local, commit atomique sur `dev` à distance (API Git Data, une nouvelle tentative si la branche a avancé). `writePost` (markdown + `blog.json`), `writeVoyage`, `deletePost`, `deleteVoyage`, `writePriorityFile`. Les lectures renvoient une `revision` (empreinte Git) ; un enregistrement fondé sur une révision périmée répond 409 (`toWriteErrorResponse`).
- Lecture du dépôt : `ContentReader` (`stores/content-reader.ts`), disque en local, API « contents » de GitHub à distance (`github/app-client.ts`, jeton d'installation en cache, contenus en cache par empreinte Git). Utilisé par `listPosts`, `readPost`, `listVoyages`, `readVoyage`, le rapport Lighthouse, la priorité amont et les compteurs d'`AdminLayout.astro`.
- Pages `src/pages/admin/*.astro` : `prerender = false` + `if (!isAdminGranted(Astro.locals)) return new Response('Not Found', { status: 404 })` en ligne.
- Routes `src/pages/api/admin/**` : `requireAdmin(locals)` (défini dans `auth/access.ts`, réexporté par `shared.ts`) dans chaque handler ; `auth/guards.test.ts` le vérifie fichier par fichier.
- CSRF : `src/middleware.ts` répond 403 à toute requête inter-sites vers `/api/admin/**` et à tout POST inter-sites vers `/api/auth/**` (le retour de GitHub sur le callback est une navigation GET inter-sites) (`isCrossSiteRequest()` : `Sec-Fetch-Site` `cross-site` ou `same-site`, sinon `Origin` différent). Une page tierce ouverte pendant `npm run dev` ne peut donc plus lancer un script par `<img src>` ou `fetch` `no-cors`. Les clients hors navigateur (curl), qui n'envoient pas ces en-têtes, restent acceptés.
- Chemins : toutes les résolutions disque passent par `safeResolve()` (traversées corrigées dans `r2/delete.ts` et `getPhysicalImagePath`) ; `syncDirToR2()` ne vide plus R2 si le dossier local manque.
- Console de scripts : `src/lib/admin/scripts.ts` (`SCRIPTS`, liste blanche ; `sync-r2` et `upload-missing-r2` sont incrémentaux, seule `mirror-r2` passe `--delete-first` et vide R2 avant l'envoi) → `api/admin/scripts/run.ts` lance `spawn('node', args)` à la racine et diffuse stdout/stderr en SSE ; l'abandon de la requête envoie `SIGTERM`. Les arguments supplémentaires sont transmis sans contrôle.
- Éditeurs blog/voyages : `BlogEditor.tsx`, `VoyagesEditor.tsx` (parties communes dans `src/components/Admin/editor/`) → `api/admin/posts`, `api/admin/voyages`, images via `api/admin/images/[year]/[slug]` et `api/admin/voyages-images/[year]/[slug]`, synchronisation R2 via `syncDirToR2()` (`src/lib/admin/r2-sync.ts`).
- Éditeur WYSIWYG (`src/components/Admin/editor/rich/`, Tiptap 3) : onglet Texte du blog et des voyages. La valeur reste le Markdown du fichier. `markdown-bridge.ts` découpe le corps en blocs avec le lexer de marked : paragraphe d'images → `imageGroup` (figure, galerie, 360°), HTML → `rawHtml`, bloc que Tiptap ne réécrirait pas à l'identique → `rawMarkdown`. Le source de chaque bloc est mémorisé et réécrit tel quel tant que le bloc n'est pas modifié ; `markdown-bridge.test.ts` vérifie l'aller-retour octet pour octet sur tous les articles. Barre d'outils, bulle de sélection, menu « / », glisser-déposer d'upload et bascule vers le Markdown source. Métadonnées dans le tiroir « Réglages » (`editor/SettingsDrawer.tsx`) ; brouillon local automatique (`editor/useLocalDraft.ts`, `localStorage`, restauration proposée à la réouverture) ; Ctrl/Cmd+S et alerte avant de quitter (`editor/useEditorShortcuts.ts`).
- Aperçu réel : `POST /api/admin/preview` garde le brouillon en mémoire et renvoie `/admin/apercu?id=…`, qui le rend avec les plugins rehype du site (`src/lib/admin/article-preview.ts`, même ordre qu'`astro.config.mjs`, vérifié par un test). Les images sont servies depuis `src/assets` par les routes admin. WARNING: le brouillon passe par l'API (protégée par le middleware inter-sites) et jamais par un POST direct vers la page, qui rend du HTML arbitraire.
- Photosphères : `.360-manifest.json` dans le dossier d'images d'un article, écrit par `mark360Image()` (`blog-files.ts`).
- Lighthouse : `scripts/audit/lighthouse-runner.mjs` → `src/data/lighthouse-results.json` → `LighthousePanel.tsx`.

## Boutique

- Pages `src/pages/boutique.astro`, `boutique/confirmation.astro`, `cgv.astro` ; composants `src/components/Shop/` ; catalogue et transporteurs dans `src/config/shop.ts`.
- Activée seulement si `ENABLE_BOUTIQUE` (ou `PUBLIC_ENABLE_BOUTIQUE`) vaut `true`. Sinon `/boutique` et `/boutique/confirmation` (SSR) redirigent vers `/404`, l'API de paiement refuse la requête, le lien de navigation est masqué et le sitemap exclut `/boutique` et `/cgv` (cette dernière reste servie).
- Paiement : `src/pages/api/shop/create-checkout-session.ts` (SSR) recalcule le prix depuis `SHOP_CONFIG`, valide quantité et point relais (`src/lib/shop/checkout-validation.ts`), crée une session Stripe Checkout avec `STRIPE_SECRET_KEY`, puis le navigateur est redirigé vers Stripe. Les erreurs renvoyées au client sont génériques.
- Point relais : `MondialRelayModal.tsx` charge à la demande jQuery, le widget Mondial Relay, Leaflet et les tuiles OpenStreetMap (domaines autorisés dans la CSP). `PUBLIC_MONDIAL_RELAY_BRAND_ID` retombe sur la marque de test `BDTEST13`.
- Conception détaillée : `docs/conception-boutique.md`.

## Données astronomiques (Turso)

Tables `variable_stars` (~4,8 M de lignes), `variable_stars_gaia`, `exoplanets`, `comets`, `asteroids`, `database_metadata`. Alimentées par `scripts/pipeline/update-*.mjs` et `crossmatch-variable-stars.mjs` ; schéma initial `scripts/db/init-db.mjs`, index complémentaires `scripts/db/create-indexes.mjs`. Les scripts créent leur client par `createTursoClient()` (`scripts/lib/turso.mjs`).

## Catalogues du ciel profond

`fetchCatalogueEntries()` (`src/lib/catalogues/fetch.ts`) lit l'instantané versionné `src/data/catalogues/<slug>.json` (`snapshot.ts`, chargement paresseux par catalogue). Sans instantané, il interroge les routes amont (voir ci-dessous). Les instantanés sont générés par `npm run update-catalogues` (`scripts/build/update-catalogue-snapshots.mjs`), qui conserve l'existant si un catalogue échoue ou revient tronqué, ou depuis la section dédiée de `/admin/database`. `buildRecommendations()` borne son chargement à 12 s ; un pool incomplet n'est gardé que 5 min, en mémoire comme sur le CDN.

Les fiches d'objets (`src/lib/objects/simbad.ts`, `vizier.ts`, `sesame.ts`) sont interrogées en direct, par les mêmes routes.

## Routes amont (CDS et miroirs)

- Registre : `src/config/upstream-routes.ts`, un service par source (`simbad`, `vizier`, `sesame`, `hips2fits`, `hipsSky`, `aladinScript`), CDS en premier par défaut. La priorité choisie dans `/admin/upstream` est écrite dans `src/data/upstream-priority.json` et ne s'applique en production qu'une fois committée et déployée. `update-catalogue-snapshots.mjs` lit le même fichier.
- Serveur : `withUpstreamFailover()` (`src/lib/upstream/failover.ts`) essaie les routes actives dans l'ordre, avec 6 s par route sauf pour la dernière. Une route en panne est sautée 60 s, en mémoire et par instance. Une erreur 4xx ou l'expiration d'une route ambiguë (Sesame Harvard expire sur un nom inconnu) n'ouvre pas le circuit.
- VizieR : seul le CDS expose le TAP. Les miroirs (Harvard, NAO, China-VO, ces deux derniers en HTTP seulement) passent par ASU (`src/lib/upstream/asu.ts`), qui convertit les coordonnées sexagésimales et rend le même tableau que le TAP. `queryVizierTable()` décrit une requête une fois pour les deux transports.
- Navigateur : `AladinViewer.tsx` charge le script depuis la première route qui répond (copie auto-hébergée dans `public/libs/aladin-lite/3.8.2/`) et sonde les fonds de ciel (`properties`). hips2fits n'a pas de miroir : avec la route SkyView, `/objets` montre une seule image DSS2 en gris et les listes un visuel neutre (`SKY_THUMBNAIL_PLACEHOLDER`).
- Sans repli : XMatch et le TAP VizieR des scripts d'étoiles variables, ainsi que le pointeur SIMBAD et la liste des relevés intégrés à Aladin.

## Routes API publiques

- `api/variable-stars.ts`, `recommendations.ts`, `catalogue/[slug].ts`, `object/resolve.ts`, `object/geocode.ts`, `shop/create-checkout-session.ts` et les trois routes prérendues passent par `src/lib/api/http.ts`.
- Paramètres bornés (OWASP API4) : `page`/`limit` plafonnés (plus de `LIMIT -1` sur 4,8 M lignes), coordonnées dans [-90, 90] / [-180, 180] (`recommendations` répond 400 hors de la Terre ou sur une date invalide), magnitudes et ouverture dans des intervalles, recherche par préfixe échappée (`escapeLikePattern()` + `ESCAPE '\'`). `geocode` exige au moins 2 caractères.
- Erreurs : `internalErrorResponse()` journalise le détail et renvoie un message générique ; aucun `err.message` ne part au client.
- Supprimées : `/api/search` (son seul appelant, `CatalogGlobalSearch`, était du code mort) et `/api/stellarium-data` (proxy ouvert inutilisé).

## En-têtes de sécurité

`src/integrations/security-headers.mjs` ajoute, après le build, une route en tête de `.vercel/output/config.json` qui pose la CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` et `Cross-Origin-Opener-Policy: same-origin-allow-popups` (popups de partage et de paiement conservées) sur toutes les réponses. Un `vercel.json` ou `public/_headers` ne serait pas appliqué : l'adaptateur écrit lui-même la config Build Output API. HSTS est fourni par Vercel. Toute nouvelle ressource externe chargée par le navigateur doit être ajoutée à `CSP_DIRECTIVES`.

`script-src` garde `'unsafe-inline'` : gestionnaires `onerror`/`onload` inline posés par `rehype-masonry`, `rehype-image-loading`, `ResponsiveImage` et la fiche astrophoto (une empreinte ne les couvre pas sans `'unsafe-hashes'`), scripts `is:inline`, CSP native d'Astro (`security.csp`) incompatible avec `<ClientRouter />`, scripts des pages SSR non collectables au build, widgets tiers (Mondial Relay, Aladin). Plan de retrait : voir « Problèmes connus ».

## Problèmes connus (non corrigés)

Suites documentées dans `docs/audits/2026-10-audit.md` (sections 5 à 7).

- **HTML du listing `/astrophotographies`** : 4,6 Mo (150 Ko gzip), 186 îlots `StaticSkyMap` dans des tiroirs cachés rendus d'avance. Les rendre à la demande suppose de remanier `GalleryGrid` et ses scripts de bascule.
- **Magnitude limite** : deux formules coexistent, `getLimitMagnitude()` (`src/lib/astro/instrument.ts`, 9 + 5·log10(D/10), soit 4 + 5·log10 D) pour comètes, astéroïdes et étoiles variables, et 2,7 + 5·log10 D dans `CatalogueViewer` et `RecommendationsViewer`. Les unifier changerait les verdicts affichés : décision laissée à l'auteur.
- **CSP `'unsafe-inline'`** : retrait envisagé en trois temps : remplacer les gestionnaires inline par un écouteur `error` en capture dans `<head>`, calculer à `astro:build:done` l'union des empreintes des scripts inline et l'envoyer d'abord en `Content-Security-Policy-Report-Only`, vérifier la console en production (boutique, carte du ciel, objets).
