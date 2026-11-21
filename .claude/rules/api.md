---
paths:
  - "src/pages/api/**"
  - "src/lib/api/**"
  - "src/lib/objects/**"
  - "src/lib/catalogues/**"
  - "src/lib/shop/**"
---

# Routes API publiques

Les routes `src/pages/api/**` hors `admin/` sont exposées en production (fonctions Vercel, ou JSON prérendu pour `asteroids`, `comets`, `exoplanets`). Règles de l'API admin : `admin-api.md`.

- Passer par `src/lib/api/http.ts` : `jsonResponse()`, `errorResponse()`, `internalErrorResponse()`.
- Paramètres : jamais de `Number()` ou `parseInt()` brut sur `searchParams`. Utiliser `parseBoundedInt()` (`page`, `limit`, toujours un `max`), `parseNumberInRange()` (latitude, longitude, magnitude, ouverture), `parseBoundedString()` (texte), `parseDateParam()`. Une valeur hors bornes donne un 400 ou la valeur par défaut, jamais une requête non plafonnée.
- SQL : requêtes paramétrées (`?`). Toute saisie insérée dans un `LIKE` passe par `escapeLikePattern()` avec `ESCAPE '\'`.
- WARNING: jamais `err.message` (ni message libSQL, Stripe, nom de variable d'environnement) dans une réponse. Dans un `catch`, `return internalErrorResponse('<route>', error)` : détail dans les logs, message générique au client.
- Appels sortants : `signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS.tap | .lookup)` et validation du JSON amont avant de le renvoyer.
- Route SSR : `export const prerender = false`. Une route prérendue qui importe `@/lib/db` rend le build dépendant de Turso.
- Fixer un `Cache-Control` explicite sur les réponses cachables (`s-maxage`) ; `errorResponse()` pose déjà `no-store`.
- Tests : à côté de la route, préfixés `_` (`api/_variable-stars.test.ts`, `catalogue/_slug.test.ts`), sinon Astro les prend pour des routes. Couvrir les bornes et le message générique des erreurs ; les seuils de couverture s'appliquent à `src/pages/api/**`.
