---
paths:
  - "src/config/shop.ts"
  - "src/config/shop.test.ts"
  - "src/components/Shop/**"
  - "src/pages/boutique.astro"
  - "src/pages/boutique/**"
  - "src/pages/api/shop/**"
  - "src/pages/cgv.astro"
---

# Boutique (livre, Stripe Checkout, Mondial Relay)

- `src/config/shop.ts` est la source unique du catalogue (prix TTC en euros) et des transporteurs. Ne jamais recopier un prix ou un transporteur dans un composant ou dans l'API : passer par `SHOP_CONFIG` et `getActiveCarrier()`.
- `create-checkout-session.ts` (`prerender = false`) recalcule le montant côté serveur depuis `SHOP_CONFIG`. Ne jamais faire confiance à un prix envoyé par le client. Les montants Stripe sont en centimes (`Math.round(prix * 100)`).
- Entrées client : passer par `parseQuantity()` et `validateRelayPoint()` (`src/lib/shop/checkout-validation.ts`) ; les métadonnées Stripe sont limitées à 500 caractères par valeur. Réponses via `errorResponse()` (`src/lib/api/http.ts`) : jamais `error.message` ni nom de variable d'environnement dans un message client.
- `isBoutiqueEnabled()` lit `ENABLE_BOUTIQUE` (ou `PUBLIC_ENABLE_BOUTIQUE`) : l'API renvoie 403 si la boutique est désactivée. Garder ce contrôle sur toute nouvelle route de paiement.
- Désactiver un transporteur = `enabled: false` dans `shippingCarriers`, sans toucher à l'UI.
- Le widget Mondial Relay charge jQuery, Leaflet et des tuiles OSM depuis des domaines externes : toute nouvelle ressource doit être ajoutée à `CSP_DIRECTIVES` dans `src/integrations/security-headers.mjs`, sinon elle est bloquée en production.
- Clés : `STRIPE_SECRET_KEY` (serveur uniquement), `PUBLIC_MONDIAL_RELAY_BRAND_ID` (`BDTEST13` en test). `PUBLIC_STRIPE_PUBLISHABLE_KEY` figure dans `docs/conception-boutique.md` mais n'est lue par aucun code (redirection vers Stripe Checkout). Ne jamais exposer la clé secrète côté client.
- Après modification de `shop.ts` : `npx vitest run src/config/shop.test.ts`.
- Conception, coûts et checklist de lancement : `docs/conception-boutique.md`.
