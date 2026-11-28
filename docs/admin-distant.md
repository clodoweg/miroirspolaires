# Admin distant (Preview de la branche `dev`)

L'administration tourne à trois endroits :

| Environnement | Admin | Contenu lu |
|---|---|---|
| `npm run dev` | oui, sans login (mode `local`) | disque (`src/content`, `src/data`, `data/`) |
| Preview Vercel de la branche `dev` | oui, login GitHub (mode `remote`) | branche `dev`, par l'API GitHub |
| Production (`main`) et autres Previews | non, 404 (mode `disabled`) | — |

Le flux de travail visé : modifier sur la Preview de `dev`, vérifier sur la même URL, puis fusionner `dev` dans `main` pour mettre en production.

## En place

### Phase 1 : login et lecture

- Login GitHub : OAuth utilisateur de la GitHub App, état signé et PKCE. Seul `ADMIN_GITHUB_USER_ID` est accepté ; session signée de 12 h (`mp_admin_session`, `HttpOnly`, `Secure`, `SameSite=Lax`).
- Routes ouvertes à distance (`src/lib/admin/remote-capabilities.ts`) : listes et lecture des articles et voyages, rapport Lighthouse, priorité des routes amont, état du cache. Toutes les autres répondent 501.
- La barre latérale, le fil d'Ariane et le bouton de déconnexion sont affichés par `AdminLayout.astro`, d'après le registre `src/config/admin-sections.ts`. Toutes les pages fonctionnent à distance ; dans une page, les panneaux qui exigent le disque ou `spawn` sont masqués à distance. Une page dont `availability` vaudrait `local` resterait dans le menu avec le badge « local » et affiche un message au lieu d'erreurs 501 ; le tableau de bord liste les pages disponibles, par section.

- Menu « Admin » dans la barre de navigation du site (`getAdminNavItem`, `src/config/navigation.ts`) : en `npm run dev` et dans le build de la Preview de `dev`, avec les seules pages qui fonctionnent dans ce mode ; absent de la production et des autres Previews.

### Phase 2 : enregistrement par commit

- `ContentWriter` (`src/lib/admin/stores/content-writer.ts`) : en local, écriture sur le disque ; à distance, commit atomique sur `dev` par la GitHub App (API Git Data : arbre, commit, référence), rejoué une fois si la branche a avancé entre-temps.
- Articles : `writePost` committe le markdown et `src/data/blog.json` (temps de lecture) ensemble. Voyages : `writeVoyage`. Suppressions : le markdown seul (les images vivent sur R2). Priorité amont : `src/data/upstream-priority.json`.
- Conflits : `readPost` et `readVoyage` renvoient la `revision` (empreinte Git du fichier) ; les éditeurs la renvoient à l'enregistrement et le serveur répond 409 si le fichier a changé ailleurs (autre appareil, push local). Recharger l'article avant de recommencer.
- Messages de commit : `chore: create|update|delete blog post <année>/<slug> from admin`, idem `travel story`, `chore: update upstream route priority from admin`. L'auteur est le bot de la GitHub App.
- Les éditeurs reçoivent `remote` : ils sautent la synchronisation disque → R2. Renommer un brouillon ne déplace pas d'images à distance.
- Travail local : `git pull` sur `dev` avant de modifier, puisque l'admin distant y committe.

### Phase 3 : images sur R2

- Envoi (`src/components/Admin/editor/uploadImages.ts`) : pour chaque photo, `POST /api/admin/uploads` renvoie une URL PUT présignée (10 min) sous `incoming/<section>/<année>/<slug>/` ; le navigateur y dépose l'original, puis `POST /api/admin/uploads/finalize` le traite (`src/lib/admin/remote-images.ts`). POURQUOI : une fonction Vercel refuse plus de 4,5 Mo.
- Traitement : `compressImage` comme en local (2400 px q82 ; photo 360° du blog : 6000 px q90 et nom suffixé `-360`), image écrite sous `<section>/<année>/<slug>/` avec ses dimensions en métadonnées R2, versions web 400/800/1200 sous `web/`, original temporaire supprimé.
- Liste, couverture (blog : `<nom>-thumb.jpg` ; voyages : `cover.jpg` et `cover-thumb.jpg`) et suppression (image, miniature, versions web) passent par R2. L'affichage dans l'éditeur redirige vers `PUBLIC_R2_URL`.
- Manifestes : à l'enregistrement d'un article ou d'un voyage, `computeImageManifestChanges` met à jour `image-dimensions.json` et `web-images.json` pour ce dossier d'après R2, dans le même commit que le texte. Supprimer une photo d'un voyage committe aussitôt la galerie nettoyée ; pour le blog, les manifestes sont corrigés au prochain enregistrement.
- Prérequis : variables `R2_*` et `PUBLIC_R2_URL` sur la Preview de `dev` ; règle CORS du bucket autorisant `PUT` depuis `https://dev.miroirspolaires.fr` (en-tête `content-type`) ; `https://*.r2.cloudflarestorage.com` est dans `connect-src` (`src/integrations/security-headers.mjs`). Conseillé : règle de cycle de vie R2 qui supprime `incoming/` après un jour (envois abandonnés).

- `/admin/blog/images` et `/admin/voyages/images` fonctionnent aussi à distance : les étapes y sont adaptées (images traitées à l'envoi, enregistrement par commit) et les textes manquants sont lus sur la branche dev (`GET /api/admin/content-gaps`, `content-gaps-reader.ts`). Les panneaux de versions web et de mise à jour des images restent réservés au local.

- `/admin/astrophotos` fonctionne aussi à distance : le CSV et les JSON de métadonnées sont lus sur la branche dev, la présence des raws, miniatures et annotations est lue sur R2 (`astro-asset-index.ts`, une liste du préfixe `astrophotographies/`), et l'enregistrement d'une fiche est un seul commit des JSON modifiés (`updatePhotoMetadata`). L'envoi d'un raw (`POST /api/admin/astrophotos/upload`) reste local.

- `/admin/boutique` (remises en main propre) fonctionne aussi à distance : lecture et décisions dans Turso (`/api/admin/shop/pickup-requests`), base partagée avec la production. L'acceptation envoie le code par Resend : `RESEND_API_KEY` et `SHOP_EMAIL_FROM` doivent être définies pour la Preview de `dev` (voir `docs/conception-boutique.md` § 4.5).
- `/admin/donnees` et ses pages (exoplanètes, étoiles variables, comètes, astéroïdes, catalogues) fonctionnent aussi à distance : statistiques lues dans Turso (`GET /api/admin/database/stats`, instantanés de catalogues lus sur la branche dev), mises à jour lancées comme jobs GitHub Actions avec leurs options (`DatabasePanel` en mode `remote`, `useRemoteJobs`). L'import VSX des étoiles variables passe par l'entrée `update-variable-stars-ci` (toujours `--no-clean`, case « Tout réimporter » pour `--fresh`, magnitude limite `--max-mag`), sans le bouton « Reprendre » (pas de fichier de progression dans GitHub Actions) ; elle partage le groupe de concurrence du workflow dédié « Update variable stars », qui reste utilisable depuis GitHub.

- L'audit SEO (`/admin/qualite/seo`) et ses vues par domaine (`/admin/astrophotos/textes`, `/admin/pages`) fonctionnent aussi à distance : `runSeoAudit` (`seo-audit.ts`) lit la branche dev. Le sitemap généré (`dist/`) n'y existe pas et apparaît non généré ; le bouton qui lance le script d'audit reste local.

- `/admin/infra/r2` fonctionne aussi à distance : inventaire du bucket par dossier et fichiers orphelins (`r2-inventory.ts` : photo absente du CSV ou sous une ancienne année, article ou voyage supprimé, version web sans source, envoi `incoming/` de plus d'un jour), supprimables après confirmation (`POST /api/admin/r2/orphans`, qui recalcule les orphelins et refuse toute autre clé). La synchronisation avec `src/assets` reste locale.

- Le tableau de bord commence par une liste « À faire » (`GET /api/admin/todo`, `admin-todo.ts`) : descriptions SEO, alts et descriptions Wikipedia manquants, instantanés de catalogues absents, rapport Lighthouse de plus de 30 jours et, à distance, commits de `dev` pas encore en production. Chaque ligne renvoie vers la page qui corrige ; une source illisible est signalée sans masquer les autres.

- « Redéployer la production » (`/admin/publication`, et pages Exoplanètes, Comètes, Astéroïdes et vue d'ensemble des données) appelle le deploy hook Vercel (`production-redeploy.ts`, `POST /api/admin/release/redeploy`) : ces pages sont générées au build à partir de Turso, une mise à jour des données n'y apparaît qu'après un nouveau build. L'URL du hook ne sort jamais du serveur.

### Phase 4 : scripts dans GitHub Actions

- `/admin/infra/scripts` (`RemoteJobsPanel.tsx`) liste les entrées `remote: true` de `SCRIPTS` (`src/lib/admin/scripts.ts`) : données Turso (exoplanètes, comètes, astéroïdes, croisement Gaia, contrôle des étoiles variables), instantanés de catalogues, Lighthouse, SEO et Wikipedia. Jamais les scripts `devOnly`, ceux qui demandent un dossier (`needsTarget`) ni l'import local des étoiles variables (son mode par défaut vide la table ; à distance, seule sa variante `update-variable-stars-ci`, `--no-clean`, est ouverte). Les seuls arguments transmis sont les `options` déclarées du script (catalogues : `--only`, `--missing`, `--force`, `--dry-run` ; cross-match Gaia : `--max-mag`, `--batch-size`, `--reset` ; import VSX : `--fresh`, `--max-mag`), cochées dans l'admin, validées au lancement, rangées avec le job dans Turso et revalidées par le runner.
- Lancer (`POST /api/admin/jobs`, `src/lib/admin/jobs.ts`) crée un job dans Turso (`admin_jobs`, `src/lib/admin/job-store.mjs`) puis déclenche `.github/workflows/admin-job.yml` sur `dev` par la GitHub App. Le runner `scripts/admin/run-admin-job.mjs` revérifie le script contre la liste blanche, envoie la sortie dans `admin_job_logs` chaque seconde et note le code de sortie ; le workflow committe sur `dev` ce que le script a écrit sous `src/data/` ou `data/`, puis l'étape de clôture enregistre le commit ou l'échec.
- L'admin relit l'état et le journal toutes les 3 s (`GET /api/admin/jobs/<id>?after=<n>`) et peut annuler (`POST …/cancel` : annule le run, ou marque le job annulé avant son démarrage, que le runner refuse alors de lancer). Un seul job actif par script.
- Prérequis : le workflow doit exister sur `main` (GitHub ne déclenche un `workflow_dispatch` que pour un fichier de la branche par défaut) ; secrets Actions `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` (jeton en écriture) ; jeton Turso en écriture aussi dans Vercel (Preview de `dev`) pour créer les jobs ; permission Actions (Read and write) de la GitHub App.

### Phase 5 : mise à jour des astrophotos dans GitHub Actions

- Entrée `update-photos-ci` de `SCRIPTS` (`remote: true`, `remoteOnly: true` : masquée et refusée en local), lancée depuis `/admin/astrophotos/importer` (case « Tout recopier » pour la variante `--force-media`) ou `/admin/infra/scripts`. Elle exécute `scripts/pipeline/update-photos.mjs --ci` :
  1. scrape AstroBin du dépôt privé `clodoweg/astrobin` (`scrape_astrobin.py --incremental --check-r2 --no-sync`) : seuls les médias absents de R2 sont téléchargés ;
  2. import du CSV, du HTML et des nouveaux médias, alts (clés déplacées si l'année d'une photo change), miniatures, fiches techniques et descriptions Wikipedia, versions web en local, dimensions ;
  3. envoi des fichiers nouveaux ou modifiés sous `incoming/astro/<run>/` (`scripts/lib/r2-staging.mjs`), puis, si tout est envoyé, copie côté serveur vers les clés définitives et suppression du préfixe temporaire ;
  4. ajout des nouvelles versions web à `web-images.json` (aucune entrée retirée), purge du cache du worker pour les images remplacées, contrôle sur R2 qu'aucune photo n'a perdu son raw ou sa miniature.
  Le workflow ne committe le CSV et les manifestes sur `dev` que si le script réussit. Un échec avant l'étape 3 n'écrit rien sur R2. Les descriptions SEO manquantes restent signalées (`/generate-seo astro`).
- `/admin/infra/cache` : à distance, « Préchauffer CDN » et « Purger le cache » lancent les jobs `warm-cache-ci` (`warm-cache.mjs --prefix=<dossier>`) et `purge-cache-ci` (`purge-cache.mjs --from-r2 --prefix=<dossier>`, images listées sur R2) ; le dossier, obligatoire, se choisit parmi `astrophotographies`, `blog` et `voyages`, et les jobs se suivent sous les boutons.
- Photos retraitées : l'option `refreshIds` de `update-photos-ci` (champ « Photos retraitées » de `/admin/astrophotos/importer`, ou lien « Reprendre » d'une photo du catalogue, qui préremplit `?refresh=<ID>`) ajoute `--refresh-ids=<id,id>` : le scrape retélécharge tous les médias de ces photos, puis le job remplace sur R2 ceux qui ont changé et purge leur cache, sans recopier toute la galerie.
- Variante `update-photos-ci-force` (`--ci --force-media`) : le scrape retélécharge tous les médias (2,8 Go) et miniatures et versions web sont régénérées ; seuls les fichiers dont le contenu diffère de R2 sont envoyés et remplacent l'existant (cache du worker purgé). Rien n'est supprimé. Durée : de 30 min à 1 h. Les deux variantes partagent un groupe de concurrence du workflow : l'une attend la fin de l'autre.
- Le CSV reste écrit par le seul scrape AstroBin : l'admin ne l'édite jamais.
- Prérequis, en plus de la phase 4 :
  - le dépôt `astrobin` doit contenir sur sa branche par défaut les options `--check-r2`, `--no-sync` et `--refresh-ids` de `scrape_astrobin.py` (sans la dernière, une reprise de photos échoue avec le code 2) ;
  - une deploy key en lecture seule sur `clodoweg/astrobin`, dont la clé privée est le secret Actions `ASTROBIN_DEPLOY_KEY` de ce dépôt ;
  - secrets Actions `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` ; facultatifs : `IMAGE_WORKER_URL`, `IMAGE_WORKER_PURGE_KEY` (cache du worker), `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` (CDN du domaine public de R2, `https://pub-r2.miroirspolaires.fr` sauf variable de dépôt `PUBLIC_R2_URL`). Le workflow ne les transmet qu'à `update-photos-ci` (et les secrets R2 et du worker aussi à `warm-cache-ci` et `purge-cache-ci`) ;
  - conseillé : règle de cycle de vie R2 supprimant `incoming/` après un jour (runs interrompus).

### Phase 6 : mise en production, journal, limitation

- `/admin/publication` (`ReleasePanel.tsx`, `src/lib/admin/github/release.ts`, routes `/api/admin/release` et `/api/admin/release/merge`) : commits de `dev` absents de `main`, ouverture de la PR `dev` → `main` (`chore: release dev to production`), suivi de sa CI, puis fusion après confirmation. WARNING: la fusion déploie le site public ; le serveur la refuse si la CI n'est pas entièrement verte (le job `verify` doit figurer parmi les vérifications : tant qu'il n'a pas démarré, la CI reste « en cours », `REQUIRED_CHECK_NAMES` de `release.ts`), si GitHub signale un conflit ou si la PR a reçu un commit depuis l'affichage. Branche de production : `ADMIN_PRODUCTION_BRANCH` (défaut `main`).
- Journal d'audit (`src/lib/admin/audit-log.ts`, table Turso `admin_audit_log` créée au premier usage) : le middleware enregistre chaque écriture (méthode autre que GET) de l'admin distant avec le compte, le chemin et le statut. `/admin/publication/journal` affiche les 200 dernières. Sans Turso, ou si le jeton Turso est en lecture seule, rien n'est enregistré et les actions passent.
- Limitation : au-delà de 120 écritures par minute pour un compte, le middleware répond 429 (`Retry-After: 60`), d'après le journal. Sans Turso, pas de limitation.

## Mise en place

1. **GitHub App** (GitHub › Settings › Developer settings › GitHub Apps › New) :
   - Homepage URL : `https://dev.miroirspolaires.fr`.
   - Callback URL : `https://dev.miroirspolaires.fr/api/auth/github/callback`.
   - Cocher « Expire user authorization tokens ». Décocher « Request user authorization (OAuth) during installation ». Webhook : désactivé.
   - Permissions du dépôt : Contents (Read and write), Pull requests (Read and write), Actions (Read and write), Checks (Read-only, pour lire la CI de la PR de mise en production), Metadata (Read-only).
   - « Where can this GitHub App be installed? » : Only on this account.
   - Après création : noter l'App ID et le Client ID, générer un client secret et une clé privée (`.pem`).
   - Installer l'App sur le seul dépôt `clodoweg/miroirspolaires` ; l'identifiant d'installation est le nombre à la fin de l'URL de la page de l'installation (`…/settings/installations/<id>`).
2. **Domaine** : Vercel › projet › Settings › Domains › ajouter `dev.miroirspolaires.fr`, rattaché à la branche `dev` (Git Branch), puis créer l'enregistrement DNS indiqué par Vercel.
3. **Identifiant GitHub** : `https://api.github.com/users/<login>` donne le champ `id` numérique.
4. **Variables Vercel** (Settings › Environment Variables), environnement **Preview**, branche **`dev`** uniquement, jamais Production :

   | Variable | Valeur |
   |---|---|
   | `GITHUB_APP_ID` | App ID |
   | `GITHUB_APP_CLIENT_ID` | Client ID |
   | `GITHUB_APP_CLIENT_SECRET` | client secret |
   | `GITHUB_APP_PRIVATE_KEY` | contenu du `.pem` (les `\n` littéraux sont acceptés) |
   | `GITHUB_APP_INSTALLATION_ID` | identifiant d'installation |
   | `ADMIN_GITHUB_USER_ID` | identifiant numérique de ton compte |
   | `ADMIN_SESSION_SECRET` | au moins 32 caractères aléatoires (`openssl rand -base64 48`) |
   | `ADMIN_CONTENT_BRANCH` | facultatif, `dev` par défaut |

   Le dépôt est lu dans les variables système `VERCEL_GIT_REPO_OWNER` et `VERCEL_GIT_REPO_SLUG` (Settings › Environment Variables › « Automatically expose System Environment Variables », activé par défaut) ; `ADMIN_GITHUB_REPOSITORY=owner/nom` les remplace au besoin. Les variables existantes dont l'admin a besoin (Turso, R2, worker) doivent aussi être définies pour la Preview de `dev`. Facultatives : `IMAGE_WORKER_URL` et `IMAGE_WORKER_PURGE_KEY` (purge du cache d'une image remplacée), `CLOUDFLARE_ZONE_ID` et `CLOUDFLARE_API_TOKEN` (purge du CDN de R2, jeton limité à « Zone › Cache Purge »), `VERCEL_PRODUCTION_DEPLOY_HOOK` (bouton « Redéployer la production » : Vercel › Settings › Git › Deploy Hooks, branche de production ; l'URL est un secret).
5. **Redéployer** la branche `dev` (les variables ne s'appliquent qu'aux nouveaux déploiements), puis ouvrir `https://dev.miroirspolaires.fr/admin`.

Vérifications :

- `https://dev.miroirspolaires.fr/admin` → GitHub → retour sur le tableau de bord.
- Un autre compte GitHub → 403. `curl https://dev.miroirspolaires.fr/api/admin/posts` sans cookie → 401 (ou la page de connexion Vercel si la protection des Previews est active).
- `https://www.miroirspolaires.fr/admin` → 404.

Si les compteurs restent à 0 ou si un bandeau rouge signale un échec de lecture, ouvrir `https://dev.miroirspolaires.fr/admin/diagnostic` (lien « Diagnostic GitHub » du bandeau ; la route JSON `/api/admin/diagnostics` refuse les liens venus d'un autre site) : la page teste le jeton d'installation, le dépôt, la branche et la lecture du contenu, et indique la variable ou la permission à corriger.

Si l'admin répond 404 sur la Preview de `dev`, une variable manque ou est invalide (secret de session trop court, identifiant non numérique) : `readRemoteAdminConfig()` refuse alors toute la configuration.

## Phases suivantes

2. ~~Écriture~~ : en place (articles, voyages, priorité amont).
3. ~~Images~~ : en place.
4. ~~Scripts~~ : en place.
5. ~~Astrophotos~~ : en place par GitHub Actions (`update-photos-ci`). Le CSV `data/astrobin_clodoweg_gallery_python.csv` reste écrit par le seul scrape AstroBin ; aucune édition depuis l'admin, locale ou distante.
6. ~~Durcissement~~ : en place.
