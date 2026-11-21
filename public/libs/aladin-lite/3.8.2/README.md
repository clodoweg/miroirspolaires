# Aladin Lite 3.8.2 (copie auto-hébergée)

Copie non modifiée de `dist/aladin.js`, servie par `/objets` quand le CDS de Strasbourg ne répond pas
(route `self-hosted` du service `aladinScript`, `src/config/upstream-routes.ts`).

- Source : https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js
- Code source : https://github.com/cds-astro/aladin-lite/tree/v3.8.2
- SHA-256 : `bed9c8ef1d1e83501b1cb782366092c72c5ecd1c88f16fef3166188ae8062066`
- Copiée le 2026-11-06.

Licence : le fichier `LICENSE` est celui du dépôt à l'étiquette `v3.8.2` (GNU LGPL v3). Le `package.json`
publié sur npm pour cette version déclare pourtant `GPL-3` (les versions suivantes déclarent `LGPL-3.0-or-later`).

Module ES uniquement : il n'expose pas `window.A`. `AladinViewer.tsx` l'importe et l'assigne lui-même.
