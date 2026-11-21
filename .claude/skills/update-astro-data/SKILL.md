---
name: update-astro-data
description: Mettre à jour les tables Turso des outils d'astronomie (étoiles variables AAVSO/VizieR, cross-match Gaia, exoplanètes, comètes, astéroïdes MPC) et vérifier la couverture.
disable-model-invocation: true
argument-hint: "variable-stars|gaia|exoplanets|comets|asteroids|check"
---

# Mise à jour des données astronomiques (Turso)

Prérequis `.env` : `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Les scripts appellent des API publiques (VizieR, CDS XMatch, NASA Exoplanet Archive, var.astro.cz, Minor Planet Center) et durent de quelques minutes à plusieurs heures.

**Annoncer la commande et son effet destructif, puis attendre l'accord de l'utilisateur.**

## 1. Diagnostic (lecture seule)

```bash
npm run check-variable-stars    # comptes par bande de magnitude, local contre VizieR, couverture Gaia
```

## 2. Étoiles variables

```bash
npm run update-variable-stars -- --max-mag 25            # reprise depuis scripts/pipeline/import-progress.json
npm run update-variable-stars -- --no-clean --max-mag 25 # repart de zéro sans effacer (comble les trous)
npm run update-variable-stars -- --fresh --max-mag 25    # DELETE FROM variable_stars, puis import complet
```

WARNING: sans `--no-clean` et sans fichier de progression, le script fait aussi un `DELETE FROM variable_stars`. Par défaut, `--max-mag` vaut 25.

Ensuite, cross-match Gaia DR3 pour les distances :

```bash
npm run crossmatch-gaia -- [--max-mag 30.8] [--batch-size 15000]
npm run crossmatch-gaia -- --reset    # vide variable_stars_gaia (les échecs mémorisés) avant de recommencer
```

Après un import complet, recréer les index de filtrage :

```bash
node scripts/db/create-indexes.mjs --check
node scripts/db/create-indexes.mjs
```

`create-indexes.mjs` ne crée pas l'index `NOCASE` proposé par l'audit 2026-10 pour la recherche par nom (`docs/architecture.md`, « Problèmes connus ») : ne le créer que sur demande.

## 3. Exoplanètes, comètes, astéroïdes

Chacun fait un `DELETE` de sa table puis réimporte tout, sans transaction : un échec en cours de route laisse la table partielle.

```bash
npm run update-exoplanets                       # VarAstro + NASA pscomppars + TESS TOI
node scripts/pipeline/update-comets.mjs         # MPC AllCometEls.txt
node scripts/pipeline/update-asteroids.mjs      # MPC NEA, Distant, Unusual, PHA
```

## Depuis GitHub Actions

Les workflows manuels `update-exoplanets.yml` et `update-variable-stars.yml` (onglet Actions, « Run workflow ») font la même chose sur un runner GitHub. Ils exigent les secrets `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` dans le dépôt. Le second propose `mode` (`no-clean` par défaut, ou `fresh`) et `max_mag`.

## À ne pas faire

- `node scripts/db/init-db.mjs` : `DROP` des 5 tables. Réservé à une reconstruction complète demandée explicitement.

## Vérification

- Relancer `npm run check-variable-stars`.
- `npm run dev`, puis ouvrir `/outils/etoiles-variables`, `/outils/exoplanetes`, `/outils/cometes` et `/outils/asteroides`.
- Rien à committer : les données vivent dans Turso. La table `database_metadata` contient les dates de synchronisation.
