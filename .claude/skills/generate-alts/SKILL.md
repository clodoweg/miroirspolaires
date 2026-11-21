---
name: generate-alts
description: Écrire les textes alternatifs manquants du blog ou des voyages en regardant les images et en lisant le récit, sans API. À utiliser quand l'utilisateur le demande ou quand un bouton de mise à jour signale des images sans alt.
disable-model-invocation: true
argument-hint: "[blog|voyages] [année/slug]"
---

# Textes alternatifs du blog et des voyages

Les boutons de l'admin ne génèrent plus d'alts. `update-content.mjs` signale ce qui manque.

## Où écrire

- **Blog** : dans le Markdown, `![alt](/assets/…)`. Le site n'y lit pas `alt.json`. L'alt apparaît aussi comme légende dans la visionneuse, même avec `hideImageCaptions: true`.
- **Voyages** : dans `src/data/alt.json`, clé `/assets/voyages/<année>/<slug>/<fichier>`, pour la couverture et la galerie. Ajouter la même valeur à `cover-thumb.jpg`.
- **Astrophotos** : rien à faire, `update-photos.mjs` construit l'alt depuis le CSV.

## Méthode

1. Lister les images sans alt avec `getContentGaps()` (`src/lib/admin/content-gaps.mjs`), qui ignore les images citées nulle part.
2. Lire le récit de l'article. Pour un voyage, chercher les mêmes noms de fichiers dans l'article de blog correspondant, qui donne le jour et le lieu.
3. Regarder les images : les réduire dans le scratchpad et les assembler en planches numérotées, sans toucher à `src/assets/`.
4. Écrire en français, 10 à 20 mots, sans « Image de » ni « Photo de », sur une seule ligne, sans `]` ni `"`.
5. Montrer le diff sans committer.

## Règles

- Ne nommer un lieu ou un objet que s'il est cité par le récit ou reconnu sans doute possible. Sinon, décrire ce qu'on voit. Ne jamais citer de cratère lunaire sans certitude.
- Ne pas nommer les personnes : « homme », « femme ».
- Ne jamais remplacer un alt existant sans demande explicite.
- Ne pas committer `alt.json` pendant qu'un script de mise à jour tourne : il réécrit le fichier entier.
