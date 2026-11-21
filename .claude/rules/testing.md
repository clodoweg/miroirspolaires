---
paths:
  - "src/**/*.test.{ts,tsx}"
  - "scripts/**/*.test.mjs"
  - "workers/**/*.test.ts"
  - "src/test/**"
  - "vitest.config.ts"
---

# Tests (Vitest)

- Lancer `npx vitest run` (toute la suite) ou `npx vitest run <fichier>` / `-t "<nom>"`. `npm test` démarre le mode watch : ne pas l'utiliser en vérification.
- Ne jamais figer un nombre de tests dans la doc ou dans un message : le relire dans la sortie de Vitest.
- Placer le test à côté du code (`foo.ts` → `foo.test.ts`, `Foo.tsx` → `Foo.test.tsx`). Le motif d'inclusion est celui par défaut de Vitest : il couvre aussi `scripts/lib/*.test.mjs` et `workers/image-resizer/src/*.test.ts` (logique pure du worker dans `core.ts`, sans WASM).
- Exception dans `src/pages/` : Astro y traite tout `.ts` comme une route, tests compris (le build échoue). Préfixer le test par `_`, qu'Astro ignore : `api/variable-stars.ts` → `api/_variable-stars.test.ts`, `[slug].ts` → `_slug.test.ts`.
- Routes API : appeler directement le handler (`GET({ url, request, params } as Parameters<typeof GET>[0])`), mocker `db`, `fetch` et les SDK (Stripe). Helpers de réponse et de validation : `src/lib/api/http.ts`.
- Environnement : `happy-dom`, `globals: true`, setup `src/test/setup.tsx` (jest-dom + `cleanup()` après chaque test). `src/test/**` est exclu de la collecte.
- `lucide-react` est mocké globalement avec une liste **explicite** d'icônes dans `src/test/setup.tsx`. Un composant testé qui utilise une icône absente de la liste échoue avec « No "X" export is defined on the "lucide-react" mock » : ajouter l'icône au mock.
- `astro:content` est aliasé vers `src/test/mocks/astro-content.ts` (`getCollection` et `getEntry` en `vi.fn`), `astro:middleware` vers `src/test/mocks/astro-middleware.ts`. Surcharger le retour dans le test avec `vi.mocked(getCollection).mockResolvedValue(…)`.
- Réseau : mocker `global.fetch` avec `vi.fn()` comme dans `BlogEditor.test.tsx` ou `LighthousePanel.test.tsx`. Aucun test ne doit appeler Turso, R2 ou une API externe.
- Les modules qui importent `src/lib/db.ts` lèvent une exception sans `TURSO_DATABASE_URL` : mocker `db` (`vi.mock('@/lib/db')`) plutôt que de définir la variable.
- Alias `@` → `src/` disponible dans les tests.
- Tester la logique pure (`src/lib/`, `src/utils/`) en priorité. Pour les composants React, utiliser Testing Library avec des requêtes par rôle ou par texte.
- Couverture : `npm run test:coverage` (= `vitest run --coverage`, v8, lancé par la CI). Seuils de `vitest.config.ts` sur `src/lib/**`, `src/utils/**`, `src/config/**` et `src/pages/api/**` : 80 % lignes, fonctions et instructions, 70 % branches. Tout nouveau module de ce périmètre arrive avec ses tests, sinon la CI échoue.
