---
name: generate-seo
description: Écrire les descriptions SEO manquantes des astrophotos ou des voyages, sans API. À utiliser quand l'utilisateur le demande ou quand l'admin signale une description SEO manquante.
disable-model-invocation: true
argument-hint: "[astro|voyages]"
---

# Descriptions SEO

Les boutons de l'admin ne génèrent pas ces textes : ils les signalent.

## Où écrire

Dans `src/data/seo.json` :

- **Astrophotos** : clé `astrophotographies/<slug(Title)>-<ID>`. Les manques apparaissent dans le bilan de `scripts/pipeline/update-photos.mjs` et dans la carte « Descr. SEO » de `/admin/astrophotos`.
- **Voyages** : clé `voyages/<année>/<slug>`. Les manques sont donnés par `getContentGaps('voyages', …)` (`src/lib/admin/content-gaps.mjs`).
- **Blog** : rien à faire, `seoDescription` reprend `description` à chaque sauvegarde dans l'éditeur.

## Méthode

1. Lire les données : ligne du CSV et `src/data/wikipedia.json` pour une photo ; frontmatter (`title`, `country`, `season`) et article de blog correspondant pour un voyage.
2. Écrire 150 caractères au maximum, sur une seule ligne, en commençant directement par le sujet ou le lieu.
3. Rester simple et factuel : pas de question, pas d'exclamation, pas de style publicitaire.
4. Ne pas utiliser « Découvrez », « Exploration », « Plongez », « Vibrez » ni aucun autre appel à l'action.
5. Montrer le diff sans committer.

## Règles

- Ne citer un fait (distance, type d'objet, lieu) que s'il figure dans ces données.
- Ne jamais remplacer une description existante sans demande explicite.
- Ne pas modifier `seo.json` pendant qu'un script de mise à jour tourne.
