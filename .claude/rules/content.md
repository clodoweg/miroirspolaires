---
paths:
  - "src/content/**"
  - "src/content.config.ts"
  - "data/**"
  - "src/data/**"
---

# Contenu

- Schémas : `src/content.config.ts`. Loader glob `**/[^_]*.{md,mdx}` : un fichier préfixé par `_` est ignoré.
- Chemins : `src/content/{blog,voyages}/<année>/<slug>.md`, avec les images dans `src/assets/{blog,voyages}/<année>/<slug>/`. Les vidéos sont à plat : `src/content/videos/<slug>.md`, image `../../assets/videos/<slug>.jpg` (dossier versionné).
- Blog, frontmatter :
  - requis : `title`, `date` (chaîne `"AAAA-MM-JJ"`), `categories` (liste), `description`, `image` ;
  - optionnels : `seoDescription`, `showImage` (`true` par défaut), `draft` (`false`), `hideImageCaptions` (`false`) ;
  - `image` et les images du corps sont des chemins absolus `/assets/blog/<année>/<slug>/<fichier>.jpg`.
- Voyages, frontmatter :
  - requis : `title`, `image` ;
  - optionnels : `date`, `description`, `gallery` (liste), `country` (chaîne ou liste), `season` (`Hiver | Printemps | Été | Automne`), `year` (nombre), `draft` ;
  - `image` et `gallery` sont des chemins relatifs `../../../assets/voyages/<année>/<slug>/…`.
- Couvertures : prévoir le `-thumb.jpg` à côté de l'image (`cover-thumb.jpg`, `<nom>-thumb.jpg`). Les listings le consomment via `toThumbUrl()`.
- Images 360° : alt commençant par `360:`, ou suffixe `#360` sur le src.
- Astrophotos : pas de markdown. La source est `data/astrobin_clodoweg_gallery_python.csv`, un export AstroBin qu'aucun script ne réécrit. Ne pas l'éditer à la main sans raison.
- `src/data/*.json` est généré par les scripts (`alt.json`, `seo.json`, `blog.json`, `wikipedia.json`, `astro_details.json`, `image-dimensions.json`, `lighthouse-results.json`). Le régénérer avec le script concerné plutôt que l'éditer à la main, puis committer le résultat.
- Après ajout ou modification d'un contenu avec images : `node scripts/build/compute-image-dimensions.mjs --only=voyages,blog`, puis les scripts SEO (procédure complète : skill `new-voyage-or-post`).
- La description SEO d'un article se met dans le frontmatter `seoDescription`, pas dans `seo.json`.
- Brouillon : `draft: true`. Ne pas supprimer un fichier pour le masquer.
