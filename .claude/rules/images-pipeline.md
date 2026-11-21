---
paths:
  - "src/utils/imageService.ts"
  - "src/components/UI/ResponsiveImage.astro"
  - "src/components/UI/AppImage.astro"
  - "src/components/Gallery/**"
  - "src/plugins/**"
  - "src/config/imageConfig.mjs"
  - "src/lib/admin/image-process.ts"
  - "workers/image-resizer/**"
  - "scripts/build/**"
  - "astro.config.mjs"
---

# Pipeline d'images

Détail complet dans `docs/architecture.md` (section Images).

- Les images de `astrophotographies/`, `blog/` et `voyages/` sont sur R2 et absentes de git comme de la CI. Le build ne peut pas les mesurer : toute image ajoutée ou déplacée exige `node scripts/build/compute-image-dimensions.mjs` (option `--only=astro,voyages,blog,videos` pour cibler) et le commit de `src/data/image-dimensions.json`. Les clés sont relatives à `src/assets/`.
- Garder l'ordre des plugins dans `astro.config.mjs` : `rehypeProbeDimensions` → `rehypeMasonry` → `rehypeImageLoading` → `rehypeFigure`. Masonry recopie les width/height posés par probe.
- `rehype-probe-dimensions.mjs` lit le JSON via `createRequire`. Ne pas le remplacer par `import … with { type: 'json' }`, qui a cassé le déploiement Vercel.
- URL du worker : `${IMAGE_WORKER_URL}/w_<largeur>,q_<qualité>,f_jpeg/<clé>`, composée par `composeWorkerUrl()` (`src/utils/workerUrl.ts`, sans dépendance serveur). Côté serveur, passer par `buildOptimizedUrl()` ; dans un îlot client (qui ne doit pas importer `imageService.ts`), par `composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, …)` comme `PhotoMarkers.tsx` et `PhotoList.tsx`.
- Toujours `f_jpeg`. Photon ne sait produire que du WebP sans perte (environ 5× plus lourd), et le worker convertit de toute façon `f_webp` en JPEG.
- Le worker sert l'original sans le traiter si la source dépasse 500 Ko ou 1,8 MP (limite CPU du plan gratuit). Il sert aussi directement, sans traitement, toute clé contenant `/mini/` ou finissant par `-thumb.jpg`, et `buildOptimizedUrl()` renvoie pour elles l'URL R2. Pour les listings et les grilles, consommer `-thumb.jpg` (`toThumbUrl()`) ou `mini/` (`resolveImage(path, true)`).
- Versions web : `node scripts/build/generate-web-images.mjs --upload` produit `web/<clé sans extension>-w<400|800|1200>.jpg` sur R2 pour blog, voyages et `astrophotographies/mini/`, et réécrit `src/data/web-images.json` (à committer). Le site ne sert ces fichiers (directement depuis R2, sans worker) que pour les clés du manifeste : `ResponsiveImage`, `rehype-masonry`, `buildOptimizedUrl()` jusqu'à 1 200 px, `GalleryGrid`, la carte du ciel et `own-photos.ts`. Logique partagée dans `src/utils/webImages.mjs` (sans dépendance, chargée par `createRequire` dans les plugins). Relancer le script après tout ajout d'images, y compris par l'admin : le bandeau `WebImagesReminder` (tableau de bord, R2, blog, voyages, astrophotos) compte les images absentes du manifeste (`/api/admin/web-images/status`) et lance le script sur un seul domaine. La liste des sources vit dans `src/lib/admin/web-image-sources.mjs`, partagée avec le script.
- WARNING: ne jamais faire pointer une vignette vers l'original `astrophotographies/<année>/…_raw.jpg` : le worker le renvoie entier (71,7 Mo mesurés pour un `w_400`). Utiliser la `mini/` ou sa version web.
- `ResponsiveImage.astro` sert les `-thumb.jpg` directement depuis R2, sans srcset (`isPresizedThumb`). Ne pas les faire passer par le worker, qui les ré-encoderait une seconde fois (q80 desktop, q60 mobile).
- Largeurs autorisées : `IMAGE_CONFIG.WIDTHS` = `[400, 800, 1200]` (`src/config/imageConfig.mjs`). Ne pas réintroduire 1600+.
- Les miniatures produites par l'admin sont en 800 px q60 mozjpeg (`compressImage()`). Celles de `regen-thumbs.mjs` sont en 800 px q75.
- Markdown : seule la 1re image d'un corps est `eager`. Les suivantes sont `lazy` + `fetchpriority=low`. `PUBLIC_EAGER_LOAD_COUNT` est lu mais ignoré par `rehype-image-loading.mjs`.
- Images 360° : un alt qui commence par `360:` ou un src qui contient `#360` envoie l'image directement vers R2 pour Pannellum. Elles sont exclues de masonry. `/api/r2-image/` ne sert que `blog|voyages/<année>/<slug>/<nom>` avec des noms simples (lettres, chiffres, `_`, `.`, `-`) : un panorama dont le nom contient un espace ou un accent renverrait 404.
- `FORCE_LOCAL_IMAGES=true` : résolution locale via `import.meta.glob`, sans requête R2 ni srcset. En dev, les images blog/voyages passent par `/api/admin/images/…` et `/api/admin/voyages-images/…`.
- Un nouveau dossier d'assets versionné doit être ajouté à `LOCAL_ONLY_DIRS` dans `src/config/imageConfig.mjs` (source unique) et dans `src/assets/.gitignore`.
- Worker : déployer avec `cd workers/image-resizer && npx wrangler deploy`.
- Le cache du worker est indexé par URL complète. Toute nouvelle combinaison largeur/qualité (dans `buildOptimizedUrl()` ou une URL écrite en dur) doit être ajoutée à `IMAGE_CONFIG.CACHED_VARIANTS`, sinon `scripts/r2/purge-cache.mjs` ne la purgera jamais.
