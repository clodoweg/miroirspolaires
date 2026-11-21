# Conception Technique et Fonctionnelle — Boutique & Vente du Livre
> **Site :** Miroirs Polaires (`www.miroirspolaires.fr`)  
> **Auteur / Projet :** Vente en ligne du livre d'art et d'astrophotographie  
> **Date de conception :** Octobre 2026  
> **Statut :** Implémenté & Validé — Prêt pour le déploiement  

---

## 1. Vision et Objectifs

### 1.1 Objectif principal
Mettre en place une expérience d'achat directe, élégante et sans friction pour la vente d'un livre d'auteur (estimé à **39,00 € TTC**), parfaitement intégrée à l'univers visuel de *Miroirs Polaires* (thème sombre, accents or champagne, typographie d'art).

### 1.2 Principes directeurs de conception
1. **Légèreté & Zéro maintenance d'infrastructure :** Pas de base de données dédiée obligatoire pour démarrer. Les transactions, le suivi des commandes, les coordonnées clients et le stock sont administrés directement via le tableau de bord et l'application mobile **Stripe**.
2. **Choix du transporteur & Flexibilité totale :** Proposer à l'acheteur le choix entre **Mondial Relay** (sélection du point relais sur carte interactive avant paiement) et la **remise en main propre** (gratuite, uniquement après accord préalable de l'auteur). Tous les transporteurs et leurs tarifs sont centralisés dans un fichier de configuration et peuvent être activés/désactivés en modifiant un simple booléen.
3. **Paiement unifié & Sécurisé :** Utilisation de **Stripe Checkout** hébergé, permettant d'accepter simultanément la Carte Bancaire, Apple Pay, Google Pay et **PayPal** sous un même tunnel certifié PCI-DSS.
4. **Évolutivité :** L'architecture est pensée dès le départ pour accueillir ultérieurement des tirages photos d'art (formats, supports, séries limitées).

---

## 2. Architecture Technique

### 2.1 Stack logicielle existante
- **Framework :** Astro 7 (en mode `output: 'static'` avec adaptateur `@astrojs/vercel`).
- **Composants dynamiques :** React 19.
- **Styling :** Tailwind CSS 3.4 avec design tokens stricts (`STYLE-GUIDE.md`).
- **Hébergement :** Vercel (Edge & Serverless Functions).

### 2.2 Mode Hybride (SSR ciblé)
Astro compile l'intégralité du site en statique pour des performances maximales. Les nouvelles routes de la boutique adoptent le mode hybride :
- Les pages vitrines (`/boutique`, `/boutique/confirmation`, `/cgv`) sont **pré-rendues en statique** (chargement instantané, SEO optimal).
- L'endpoint de création de session (`/api/shop/create-checkout-session.ts`) utilise `export const prerender = false;` pour s'exécuter en tant que fonction Serverless Vercel sécurisée.

```
                      PARCOURS TECHNIQUE GLOBAL
                      
[ Visiteur sur /boutique ]
           │
           ├─ 1. Sélectionne un mode de livraison (Mondial Relay ou remise en main propre)
           ├─ 2. Si Mondial Relay : sélectionne son point relais sur la carte
           └─ 3. Clique sur "Commander le livre — XX,XX €"
           │
           ▼
[ POST /api/shop/create-checkout-session ]  (Serverless Astro / Vercel)
           │
           ├─ Vérifie côté serveur le prix du livre et les frais de port réels
           ├─ Injecte les métadonnées (ID et adresse du point relais si applicable)
           └─ Initialise la session Stripe Checkout
           │
           ▼
[ Redirection Stripe Checkout ]  (Page sécurisée Stripe)
           │
           ├─ Choix : CB / Apple Pay / Google Pay / PayPal
           ├─ Saisie de l'adresse de facturation
           └─ Validation du paiement
           │
           ▼
[ Redirection vers /boutique/confirmation ]
           │
           ├─ Affichage du récapitulatif chaleureux et consignes d'expédition
           ├─ Email automatique avec reçu / facture PDF envoyé au client
           └─ Notification push + email envoyée à l'auteur (avec adresse/relais)
```

---

## 3. Configuration Centralisée du Catalogue & Transporteurs

Tous les paramètres de vente résident dans un fichier unique : `src/config/shop.ts`.

### 3.1 Structure du fichier (`src/config/shop.ts`)
```typescript
/**
 * @file src/config/shop.ts
 * @description Configuration centralisée de la boutique Miroirs Polaires.
 * Définit les caractéristiques du livre et la grille tarifaire des transporteurs.
 *
 * POURQUOI : Centraliser les données marchandes permet de modifier les prix,
 * descriptions et transporteurs sans toucher aux composants graphiques ni aux routes d'API.
 *
 * OPTIONS DISPONIBLES :
 * - Pour désactiver un transporteur : passer `enabled: false`.
 * - Pour modifier le tarif de livraison : modifier `price` (en euros).
 * - Pour changer le prix de vente du livre : modifier `price` dans l'objet `book`.
 */

export interface ShippingCarrier {
  /** Identifiant unique interne */
  id: 'mondial_relay' | 'remise_main_propre' | string;
  /** Nom affiché à l'acheteur */
  name: string;
  /** Description du délai et des conditions */
  description: string;
  /** Tarif de livraison en Euros */
  price: number;
  /** Interrupteur d'activation : true pour afficher, false pour masquer */
  enabled: boolean;
  /** Type de livraison : en point relais ou remise en main propre */
  type: 'relay' | 'pickup';
}

export interface BookProduct {
  id: string;
  title: string;
  subtitle: string;
  price: number; // en Euros TTC
  currency: 'EUR';
  weightGrams: number;
  description: string;
  specs: { label: string; value: string }[];
  images: { src: string; alt: string; isCover?: boolean }[];
}

export const SHOP_CONFIG: {
  book: BookProduct;
  shippingCarriers: ShippingCarrier[];
} = {
  book: {
    id: 'livre-miroirs-polaires-vol1',
    title: "Miroirs Polaires — Splendeurs du Ciel Nocturne",
    subtitle: "Un voyage photographique et contemplatif à travers l'univers et les constellations",
    price: 39.00,
    currency: 'EUR',
    weightGrams: 850,
    description: `À travers plus de 190 pages de photographies haute définition capturées lors de nuits d'observation sous des ciels d'exception, découvrez les nébuleuses lointaines, les galaxies et la poésie du cosmos. Ouvrage imprimé sur papier d'art à fort grammage avec couverture rigide toilée et dorure à chaud.`,
    specs: [
      { label: "Format", value: "21 × 29,7 cm (A4 relié)" },
      { label: "Pagination", value: "192 pages d'art" },
      { label: "Papier", value: "Couché demi-mat 170g" },
      { label: "Finition", value: "Couverture cartonnée rigide, dorure or à chaud" },
      { label: "Impression", value: "Quadrichromie haute fidélité trame fine" },
      { label: "Langue", value: "Français" },
    ],
    images: [
      { src: "/images/shop/livre-couverture.webp", alt: "Couverture du livre Miroirs Polaires", isCover: true },
      { src: "/images/shop/livre-interieur-1.webp", alt: "Double page intérieure du livre" },
      { src: "/images/shop/livre-interieur-2.webp", alt: "Détail de la reliure et de la dorure" },
    ],
  },
  shippingCarriers: [
    {
      id: 'mondial_relay',
      name: "Mondial Relay",
      description: "Livraison en point relais sous 3 à 5 jours ouvrés",
      price: 4.50,
      enabled: true, // POURQUOI: Option la plus économique pour les acheteurs
      type: 'relay',
    },
    {
      id: 'remise_main_propre',
      name: "Remise en main propre",
      description: "Uniquement après accord préalable de l'auteur. Lieu et date à convenir ensemble.",
      price: 0,
      enabled: true,
      type: 'pickup',
      requiresPriorAgreement: true, // POURQUOI: l'acheteur confirme l'accord, contrôlé aussi côté API
    },
  ],
};
```

---

## 4. Parcours Utilisateur & Détail des Composants

### 4.1 Page `/boutique` (`src/pages/boutique.astro`)
- **Hero / Showcase du livre :**
  - Galerie de photos ou mockup 3D du livre avec zoom et aperçu double page.
  - Résumé éditorial, caractéristiques techniques sous forme de badges élégants.
  - Présentation de la démarche artistique de l'auteur.
- **Bloc interactif d'achat (`BookPurchaseCard.tsx`) :**
  - Affichage clair du prix : **39,00 €**.
  - Sélecteur radio des transporteurs disponibles (filtré sur `enabled === true`).
  - Si l'utilisateur clique sur **Mondial Relay** :
    - Un bouton bien visible apparaît : *« Choisir mon point relais »*.
    - Un clic ouvre la carte modale officielle Mondial Relay.
    - Une fois le relais sélectionné, son nom et son adresse complète s'affichent avec une pastille verte de confirmation.
  - Si l'utilisateur clique sur **Remise en main propre** :
    - Une case obligatoire lui fait confirmer qu'il a obtenu l'accord de l'auteur.
  - Bouton d'action principal (CTA avec le composant de style du site) :
    - Libellé dynamique : **« Commander · [Total] € »** (ex: *39 € + 4,50 € = 43,50 €*).
    - État de chargement (spinner) lors de la redirection vers Stripe.

### 4.2 Intégration du Widget Mondial Relay
Le widget utilise l'API de sélection officielle Mondial Relay (Parcelshop Picker) intégrée via un composant React :
- **Clé enseigne de test par défaut :** `BDTEST13` (permet de tester immédiatement la recherche de code postal et la sélection de relais).
- **Données capturées à la sélection :**
  ```typescript
  interface SelectedRelayPoint {
    id: string;        // ex: "FR-12345"
    name: string;      // ex: "TABAC PRESSE DES ETOILES"
    address: string;   // ex: "14 RUE DE LA REPUBLIQUE"
    zipCode: string;   // ex: "75001"
    city: string;      // ex: "PARIS"
    country: string;   // ex: "FR"
  }
  ```

### 4.3 Endpoint de Paiement (`/api/shop/create-checkout-session.ts`)
- **Méthode :** `POST`
- **Sécurité & Contrôle :**
  - L'API ne fait **jamais confiance** au montant envoyé par le client.
  - Elle relit `SHOP_CONFIG` côté serveur pour récupérer le vrai prix du livre et le vrai tarif du transporteur sélectionné.
  - Si le transporteur est `mondial_relay`, elle vérifie qu'un point relais a bien été transmis.
- **Session Stripe Checkout générée :**
  - `mode: 'payment'`
  - `payment_method_types: ['card', 'paypal', 'link']` (selon les méthodes actives sur le compte Stripe).
  - Ligne d'article 1 : Le livre (39,00 €).
  - Ligne d'article 2 : Les frais de port du transporteur choisi.
  - `metadata` Stripe enregistrées :
    - `carrier_id`: `mondial_relay` ou `remise_main_propre`
    - `relay_id`, `relay_name`, `relay_address`, `relay_city`, `relay_zipcode` (si Mondial Relay).
  - `prior_agreement_confirmed`: `true` (si remise en main propre).
  - URLs de redirection :
    - Succès : `https://www.miroirspolaires.fr/boutique/confirmation?session_id={CHECKOUT_SESSION_ID}`
    - Annulation : `https://www.miroirspolaires.fr/boutique`

### 4.4 Page de confirmation (`/boutique/confirmation.astro`)
- Message de remerciement personnalisé et poétique.
- Récapitulatif : confirmation que la commande est enregistrée et sera expédiée sous 48h à 72h.
- Rappel du mode de livraison choisi.
- Invitation à explorer la galerie d'astrophotographies en attendant la réception.

---

## 5. Modèle Économique & Analyse des Coûts

### 5.1 Frais Stripe (Sans abonnement fixe)
En France, les frais de transaction Stripe standard sont de **1,5 % + 0,25 €** pour les cartes européennes grand public.

| Cas concret : Vente d'un livre | Montant |
| :--- | :--- |
| Prix du livre | 39,00 € |
| Frais de livraison (Mondial Relay) | 4,50 € |
| **Total débité à l'acheteur** | **43,50 €** |
| Commission Stripe (1,5 % de 43,50 € = 0,65 € + 0,25 €) | - 0,90 € |
| **Montant net versé sur votre compte bancaire** | **42,60 €** |

### 5.2 Frais d'outillage & infrastructure
- **Hébergement Vercel :** 0 € (inclus dans le quota gratuit des fonctions serverless).
- **Widget Mondial Relay :** 0 € (libre d'usage pour la sélection).
- **Factures & reçus Stripe :** Reçus par email gratuits et illimités ; 25 factures officielles PDF gratuites par mois.
- **Aucune vente réalisée un mois donné :** Coût total = **0,00 €**.

---

## 6. Démarches Hors-Site & Checklist de Lancement

### 6.1 Logistique & Préparation physique
1. **Emballage de protection :** Commander un stock d'étuis cartonnés rigides pour livre format A4 (type *Bookwrap* à rabats avec calage d'angles).
2. **Affranchissement :**
   - Ouvrir un compte sur [Mondial Relay](https://www.mondialrelay.fr/) ou sur une plateforme d'expédition multi-transporteurs comme [Boxtal](https://www.boxtal.com/) / [Sendcloud](https://www.sendcloud.com/).
   - Lors d'une commande Mondial Relay, copier-coller l'ID et l'adresse du point relais reçus par notification Stripe pour générer l'étiquette d'envoi.
3. **Expédition :** Déposer les colis dans le relais commerçant ou bureau de poste local.

### 6.2 Cadre Juridique et Administratif
1. **Statut & SIRET :** Renseigner votre numéro SIRET d'auto-entrepreneur ou d'artiste-auteur dans les paramètres publics de Stripe.
2. **Prix unique du livre (Loi Lang) :** Respecter le prix public fixé de 39,00 €.
3. **ISBN & Dépôt légal :**
   - Demander l'attribution de l'ISBN auprès de l'[AFNIL](https://www.afnil.org/) (gratuit pour les auto-éditeurs).
   - Réaliser le dépôt légal auprès de la Bibliothèque Nationale de France (BNF) à la parution (affranchissement postal gratuit).
4. **Conditions Générales de Vente (CGV) :**
   - Mise en ligne d'une page `/cgv` sur le site rappelant les délais de livraison, l'adresse de contact et le délai légal de rétractation de 14 jours.

---

## 7. Variables d'Environnement Requises (`.env`)

```ini
# Clés API Stripe (disponibles sur dashboard.stripe.com/apikeys)
# En phase de développement, utiliser les clés de test (préfixe sk_test_ et pk_test_)
STRIPE_SECRET_KEY=sk_test_...
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Identifiant Enseigne Mondial Relay pour le widget
# En test, utiliser le code officiel : BDTEST13
PUBLIC_MONDIAL_RELAY_BRAND_ID=BDTEST13
```

---

## 8. Plan de Réalisation Technique par Étapes

- [x] **Étape 1 :** Création du fichier de données [src/config/shop.ts](../src/config/shop.ts) avec le produit livre et la matrice des transporteurs activables.
- [x] **Étape 2 :** Création des composants React [src/components/Shop/MondialRelayModal.tsx](../src/components/Shop/MondialRelayModal.tsx) et [src/components/Shop/BookPurchaseCard.tsx](../src/components/Shop/BookPurchaseCard.tsx) (sélecteur de livraison et widget).
- [x] **Étape 3 :** Création de la route API Serverless [src/pages/api/shop/create-checkout-session.ts](../src/pages/api/shop/create-checkout-session.ts) pour Stripe Checkout.
- [x] **Étape 4 :** Création de la page vitrine [src/pages/boutique.astro](../src/pages/boutique.astro) et de la page post-paiement [src/pages/boutique/confirmation.astro](../src/pages/boutique/confirmation.astro).
- [x] **Étape 5 :** Rédaction de la page légale [src/pages/cgv.astro](../src/pages/cgv.astro) et ajout du lien dans le [Footer](../src/components/Footer.astro).
- [x] **Étape 6 :** Ajout du lien « Boutique » dans le menu de navigation [src/config/navigation.ts](../src/config/navigation.ts).
- [x] **Étape 7 :** Écriture des tests unitaires [src/config/shop.test.ts](../src/config/shop.test.ts) et validation `npm run test` + `npm run build`.

---

## 9. Bilan de l'Implémentation & Guide d'Utilisation

### 9.1 Répertoire des fichiers implémentés
1. **Configuration métier :**
   - [src/config/shop.ts](../src/config/shop.ts) : Source unique de vérité du catalogue et des transporteurs.
   - [src/config/shop.test.ts](../src/config/shop.test.ts) : Suite de tests automatisés Vitest.
2. **Interface & Expérience utilisateur :**
   - [src/components/Shop/BookPurchaseCard.tsx](../src/components/Shop/BookPurchaseCard.tsx) : Sélecteur interactif, calcul en temps réel du total et routage Stripe.
   - [src/components/Shop/MondialRelayModal.tsx](../src/components/Shop/MondialRelayModal.tsx) : Intégration du sélecteur Mondial Relay (carte interactive + saisie manuelle de secours).
   - [src/pages/boutique.astro](../src/pages/boutique.astro) : Page vitrine complète du livre d'art.
   - [src/pages/boutique/confirmation.astro](../src/pages/boutique/confirmation.astro) : Page de succès et d'instructions post-commande.
   - [src/pages/cgv.astro](../src/pages/cgv.astro) : Conditions Générales de Vente conformes au droit français.
3. **Backend & Paiement :**
   - [src/pages/api/shop/create-checkout-session.ts](../src/pages/api/shop/create-checkout-session.ts) : Endpoint serverless créant la session Stripe avec validation côté serveur et conservation des métadonnées du relais.
4. **Actifs visuels :**
   - `public/images/shop/livre-miroirs-polaires.jpg` : Mockup haute définition du livre avec couverture rigide et dorure or à chaud.

### 9.2 Guide pratique : Tester et activer Stripe en production

#### A. En développement local
1. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```
2. Ouvrir la boutique : [`http://localhost:4321/boutique`](http://localhost:4321/boutique).
3. Sélectionner un mode de livraison (tester Mondial Relay et le sélecteur de point relais).

#### B. Activer les paiements réels
1. Se connecter sur [dashboard.stripe.com](https://dashboard.stripe.com/).
2. Activer les moyens de paiement souhaités dans les paramètres (*Paramètres > Moyens de paiement* : Carte bancaire, Apple Pay, Google Pay, PayPal).
3. Renseigner vos clés de production dans les variables d'environnement de votre projet sur **Vercel** :
   - `STRIPE_SECRET_KEY = sk_live_...`
   - `PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...`
   - `PUBLIC_MONDIAL_RELAY_BRAND_ID = [Votre code enseigne ou BDTEST13]`

