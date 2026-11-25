---
name: new-astrophoto
description: Publier une nouvelle astrophotographie (scrape AstroBin, bouton de mise à jour, description SEO). À utiliser quand l'utilisateur ajoute une photo d'astronomie au site.
disable-model-invocation: true
argument-hint: "[ID AstroBin]"
---

# Nouvelle astrophotographie

Les astrophotos ne sont pas du markdown. Chaque page est générée depuis `data/astrobin_clodoweg_gallery_python.csv` (slug `<slug(Title)>-<ID>`).

## Étapes

1. Dans le dépôt `astrobin`, à la main : `python3 scrape_astrobin.py --incremental`. Il télécharge les médias absents, génère les SVG manquants et copie le tout vers ce dépôt. Vérifier que le fichier brut est bien arrivé : `src/assets/astrophotographies/<AAAA>/<ID>_raw.jpg`, avec `AAAA` = les 4 premiers caractères de la colonne `Uploaded`.
2. Bouton « Mettre à jour les photos » de `/admin/astrophotos/importer` (en local, ou job GitHub Actions sur l'admin distant, qui fait aussi l'étape 1), ou `node scripts/pipeline/update-photos.mjs` après confirmation (écrit sur R2). `--dry-run` pour simuler. Il traite toutes les photos du CSV : import, années modifiées, miniatures, alts depuis le CSV, données Wikipedia, envoi R2 (`--changed`, sans suppression), dimensions et versions web. Lire le bilan affiché à la fin.
3. Si le bilan ou l'admin signale une description SEO manquante : `/generate-seo astro`.
3 bis. Photo retraitée sur AstroBin (même ID) : lien « Reprendre » de la photo dans `/admin/astrophotos`, ou champ « Photos retraitées » de l'import (option `--refresh-ids` du job).
4. Facultatif, pour préchauffer le CDN : `node scripts/r2/warm-cache.mjs astrophotographies/<AAAA>`

WARNING: ne jamais ajouter `--delete-first` à un envoi R2 : il vide le préfixe avant de tout réenvoyer. Les anciens objets R2 restent sous l'ancienne année quand une photo en change.

## Vérification

- `npm run dev`, puis ouvrir `/astrophotographies/<slug>-<ID>` : image, carte `StaticSkyMap`, alt-text et description présents.
- `npx astro check` et `npx vitest run`.
- Committer le CSV et les fichiers modifiés de `src/data/` : `alt.json`, `seo.json`, `wikipedia.json`, `astro_details.json`, `image-dimensions.json`, `web-images.json`. Les images ne sont pas versionnées.
