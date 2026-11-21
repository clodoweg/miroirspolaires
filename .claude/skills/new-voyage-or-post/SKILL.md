---
name: new-voyage-or-post
description: Créer un récit de voyage ou un article de blog (fichier markdown, images, miniatures, dimensions, SEO, upload R2). À utiliser quand l'utilisateur ajoute un voyage ou un article.
disable-model-invocation: true
argument-hint: "voyage|blog <année> <slug>"
---

# Nouveau voyage ou article

Il n'existe pas de script de création. L'éditeur admin (`npm run dev`, puis `/admin/voyages` ou `/admin/blog`) fait tout : compression des images, miniatures, `.360-manifest.json` et sync R2. Le proposer en premier. Sinon, suivre la procédure manuelle ci-dessous. Les schémas sont dans `.claude/rules/content.md` et `src/content.config.ts`.

## Fichiers

| | Voyage | Article |
|---|---|---|
| Markdown | `src/content/voyages/<année>/<slug>.md` | `src/content/blog/<année>/<slug>.md` |
| Images | `src/assets/voyages/<année>/<slug>/` | `src/assets/blog/<année>/<slug>/` |
| Chemins dans le frontmatter | relatifs : `../../../assets/voyages/<année>/<slug>/cover.jpg` | absolus : `/assets/blog/<année>/<slug>/<fichier>.jpg` |
| Champs requis | `title`, `image` | `title`, `date` (`"AAAA-MM-JJ"`), `categories`, `description`, `image` |

Modèles réels :
- `src/content/voyages/2026/le-sud-de-la-norvege.md`
- `src/content/blog/2026/la-route-des-fjords.md`

## Étapes

1. Créer le markdown et copier les images. Pour l'article, ajouter `seoDescription` dans le frontmatter.
2. Images : passer par l'admin, qui produit un full en 2400 px q82 et un `-thumb.jpg` en 800 px q60. En manuel, générer les miniatures manquantes de couverture avec `node scripts/build/regen-thumbs.mjs`.
3. `node scripts/build/compute-image-dimensions.mjs --only=voyages,blog`
4. Textes : `/generate-alts <blog|voyages>`, et `/generate-seo voyages` pour un voyage. L'article reçoit son temps de lecture à la sauvegarde dans l'admin, ou avec `node scripts/seo/blog-metadata.js`.
5. Upload R2. Demander confirmation. Ou bien utiliser le bouton sync de l'admin.
   `node scripts/r2/upload_local_to_r2.js <voyages|blog>/<année>/<slug>`
   Incrémental par défaut (fichiers absents de R2 seulement ; `-f` pour réécrire une image modifiée). WARNING: pas de `--delete-first` sans demande explicite : il vide le préfixe R2.
6. Versions web 400/800/1200 px (écrit sur R2 sous `web/`, demander confirmation) : `node scripts/build/generate-web-images.mjs --only=<voyages|blog> --upload`, puis committer `src/data/web-images.json`. Sans cette étape, les nouvelles images passent par le worker, qui sert l'original entier au-delà de 500 Ko.

## Vérification

- `npm run dev` : page de détail, grille masonry, légendes, miniature dans le listing (`/voyages` ou `/blog`).
- `npx astro check` et `npx vitest run`. `npm run build` si des images inline ont été ajoutées.
- Committer le markdown, `src/data/image-dimensions.json`, `seo.json`, `blog.json` et `alt.json`. Les images ne sont pas versionnées. Pour un article avec photosphères, committer aussi son `.360-manifest.json`, qui n'est pas ignoré.
