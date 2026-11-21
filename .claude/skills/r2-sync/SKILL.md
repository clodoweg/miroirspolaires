---
name: r2-sync
description: Synchroniser les images entre src/assets et le bucket Cloudflare R2 (upload incrémental, téléchargement, couverture, suppression, purge et préchauffage du cache du worker).
disable-model-invocation: true
argument-hint: "upload|download|coverage|purge|warm|delete [préfixe]"
---

# Synchronisation R2

Dossiers concernés : `astrophotographies/`, `blog/` et `voyages/`. Les dossiers `a-propos/`, `index/`, `observatoires/` et `videos/` sont exclus (`LOCAL_ONLY_DIRS`).

Prérequis `.env` : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `R2_BUCKET_NAME`. Les scripts s'arrêtent (code 1) si l'une manque (`requireR2Config()`, aucun bucket par défaut). Pour purger : `IMAGE_WORKER_URL`, `IMAGE_WORKER_PURGE_KEY` (doit égaler le secret `PURGE_KEY` du worker, sinon 401) ; pour préchauffer : `IMAGE_WORKER_URL`.

Aucun de ces scripts ne demande confirmation. Seuls `upload_local_to_r2.js` et `delete-dirs.mjs` ont un `--dry-run` (et refusent toute option inconnue). **Annoncer la commande exacte et attendre l'accord de l'utilisateur avant chaque lancement.**

## 1. Voir ce qui manque (lecture seule côté R2)

```bash
node scripts/audit/r2-coverage.js     # HEAD publics sur PUBLIC_R2_URL ; écrit missing_r2_upload.txt (git-ignoré)
```

## 2. Envoyer

```bash
node scripts/r2/upload_local_to_r2.js <dir>           # n'envoie que les fichiers absents (défaut, -i accepté)
node scripts/r2/upload_local_to_r2.js <dir> -f        # réécrit aussi les fichiers existants
node scripts/r2/upload_local_to_r2.js <dir> --delete-first --dry-run   # montre ce que ferait le miroir
```

`<dir>` est un dossier de premier niveau ou un sous-chemin (`blog/2026`).

WARNING: `--delete-first` **vide le préfixe R2** puis réenvoie tout (sans `<dir>` : `astrophotographies/`, `blog/` et `voyages/`). N'utiliser ce mode que sur demande explicite, après un `--dry-run`. Il est refusé si le dossier local manque. Dans `/admin`, c'est l'entrée `mirror-r2` (case « Delete first » de R2Panel).

## 3. Télécharger

```bash
node scripts/r2/download_r2_to_local.js [préfixe] [--skip-raw|-s] [--force|-f]
```

Le script écrase les fichiers locaux dont la taille diffère. `-s` ignore les bruts `astrophotographies/<AAAA>/`.

## 4. Cache du worker

```bash
node scripts/r2/purge-cache.mjs [dossier|all]    # défaut : astrophotographies ; fichiers présents en local seulement
node scripts/r2/warm-cache.mjs [préfixe|all]     # liste le bucket R2
```

La purge couvre l'URL nue et chaque variante `f_jpeg` de `IMAGE_CONFIG.CACHED_VARIANTS` (une requête par variante, 200 ms entre chaque : compter plusieurs minutes par dossier). Le préchauffage ne couvre que les 6 variantes des srcset. Les deux scripts sortent en code 1 si une requête échoue.

## 5. Supprimer (destructif)

```bash
node scripts/r2/delete-dirs.mjs <préfixe> [<préfixe>…] --dry-run   # liste ce qui serait supprimé
node scripts/r2/delete-dirs.mjs <préfixe> [<préfixe>…]
```

WARNING: sans préfixe, le script supprime `a-propos/`, `index/`, `observatoires/` et `videos/` du bucket. Toujours passer les préfixes explicitement, et lancer d'abord `--dry-run`.

## Après une synchronisation

- Images ajoutées ou déplacées : `node scripts/build/compute-image-dimensions.mjs`, puis committer `src/data/image-dimensions.json`.
- Miniatures recalculées à envoyer : `node scripts/build/regen-thumbs.mjs --upload` (écrase les fichiers sur R2).
