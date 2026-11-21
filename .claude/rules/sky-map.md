---
paths:
  - "src/components/SkyMap/**"
  - "src/hooks/useStellariumEngine.ts"
  - "src/hooks/useSkyNavigation.ts"
  - "src/hooks/useCameraInfo.ts"
  - "src/pages/carte-du-ciel.astro"
  - "src/pages/carte-du-ciel/**"
  - "src/pages/astrophotographies/**"
  - "src/lib/stellarium-utils.ts"
  - "src/lib/constellations.ts"
  - "scripts/stellarium/**"
---

# Carte du ciel (Stellarium Web)

- Moteur : `public/js/stellarium-web-engine.js` et `.wasm` (environ 1,2 Mo de WASM), données dans `public/data/` (seul chemin lu ; `scripts/stellarium/build.sh` y copie les données et réapplique `french-names.cjs`). Il est injecté à la main par `useStellariumEngine.ts`, pas importé par Vite.
- Hydratation : `StellariumMapContainer` en `client:idle` sur `/carte-du-ciel`, `StaticSkyMap` en `client:visible` sur les fiches astrophoto. Ne jamais passer en `client:load`. L'initialisation du moteur bloque le thread principal (TBT).
- Garder le `setTimeout(init, 400)` de `useStellariumEngine.ts` : il laisse passer le LCP avant l'initialisation.
- Garder le patch `addEventListener` en `passive: false` (WARNING dans le hook). Sans lui, le moteur ne peut pas appeler `preventDefault()` sur wheel et touch, et le scroll de la page entre en conflit avec le zoom.
- `BaseLayout.astro` intercepte `astro:before-preparation` et force une navigation complète vers `/carte-du-ciel`. Le canvas et le module WASM ne survivent pas au `ClientRouter`. Ne pas retirer ce script.
- Conteneur de `StaticSkyMap` : conserver `content-visibility: auto`, `contain-intrinsic-size: auto 400px` et le squelette `aspect-photo md:aspect-[2/1]`, sinon le layout bouge (CLS).
- Coordonnées : utiliser `j2000ToHorizontal()` et `horizontalToJ2000()` de `src/lib/stellarium-utils.ts`. Ne pas réécrire la trigonométrie.
- Constellations : abréviations UAI à 3 lettres (`Ori`, `Cas`, `Gem`…). Nom français via `getConstellationName()` (`src/lib/constellations.ts`). Les entrées « Gemini » des scripts sont la constellation des Gémeaux.
- `/carte-du-ciel/[slug]` est une route héritée qui redirige vers `/carte-du-ciel?mode=catalogue…`.
- Marqueurs photo : `carte-du-ciel.astro` fournit `thumbnailUrl` (version web de 400 px de la `mini/`, voir `images-pipeline.md`) quand elle existe ; sinon les îlots demandent `astrophotographies/mini/…` au worker (`w_300,q_70,f_jpeg` dans `PhotoMarkers.tsx`, `w_150` dans `PhotoList.tsx`), qui la sert entière (1 600 px, ~380 Ko). Jamais l'original. URL composée par `composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, …)` (`src/utils/workerUrl.ts`) : ces îlots ne doivent pas importer `imageService.ts`.
- `PhotoList.tsx` : rendre le repli d'une vignette en échec par React, jamais par `innerHTML` (le slug peut venir de `?search=`).
- Reconstruire le moteur : `bash scripts/stellarium/build.sh` depuis la racine (Docker + Emscripten). Le script écrit dans `public/js/` et `public/data/`.
- `src/components/SkyMap/CrosshairReticle.tsx` est fait de `<div>` CSS (ni SVG ni WebGL).
