/**
 * @file src/config/shop.ts
 * @description Configuration centralisée de la boutique Miroirs Polaires.
 * Définit la fiche produit du livre, les spécifications techniques et la matrice
 * des transporteurs activables.
 *
 * POURQUOI :
 * Permet de modifier les prix, les textes de présentation, et d'activer/désactiver
 * des modes de livraison (ex: désactiver temporairement un transporteur en grève
 * ou en rupture d'étiquettes) sans modifier le code de l'interface ou des API.
 *
 * OPTIONS ET EXEMPLES :
 * - Activer/Désactiver un transporteur :
 *   `enabled: true` (affiché et sélectionnable) ou `enabled: false` (masqué instantanément).
 * - Modifier le prix du livre :
 *   `price: 39.00` (valeur en euros TTC).
 * - Ajouter un nouveau transporteur (ex: Chronopost) :
 *   Ajouter un objet conforme à `ShippingCarrier` dans le tableau `shippingCarriers`.
 */

export interface ShippingCarrier {
    /** Identifiant technique du transporteur (utilisé dans les métadonnées Stripe) */
    id: 'mondial_relay' | 'remise_main_propre' | string;
    /** Nom public affiché à l'acheteur */
    name: string;
    /** Description du délai et des conditions de livraison */
    description: string;
    /** Tarif de livraison en Euros TTC */
    price: number;
    /** Interrupteur d'activation : true pour afficher, false pour masquer */
    enabled: boolean;
    /** Type de livraison : point relais interactif ou remise en main propre */
    type: 'relay' | 'pickup';
    /** Réservé aux acheteurs munis d'un code délivré par l'auteur (`/admin/boutique`, vérifié au paiement) */
    requiresPriorAgreement?: boolean;
    /** Délai indicatif en jours ouvrés */
    estimatedDays?: string;
}

export interface BookSpec {
    label: string;
    value: string;
}

export interface BookProduct {
    id: string;
    title: string;
    subtitle: string;
    author: string;
    price: number; // en Euros TTC
    currency: 'EUR';
    weightGrams: number;
    description: string;
    quote?: string;
    specs: BookSpec[];
    highlights: string[];
    images: {
        src: string;
        alt: string;
        isCover?: boolean;
        caption?: string;
    }[];
}

export interface ShopConfig {
    book: BookProduct;
    shippingCarriers: ShippingCarrier[];
}

export const SHOP_CONFIG: ShopConfig = {
    book: {
        id: 'livre-miroirs-polaires-vol1',
        title: 'Miroirs Polaires — Splendeurs du Ciel Nocturne',
        subtitle: "Un voyage photographique et contemplatif à travers l'univers, les nébuleuses et les aurores",
        author: 'Miroirs Polaires',
        price: 39.0,
        currency: 'EUR',
        weightGrams: 850,
        quote: '« Observer le ciel, c’est voyager dans le temps et contempler la beauté silencieuse du cosmos. »',
        description: `Fruit de nombreuses nuits d'observation et de traque sous des ciels préservés, cet ouvrage réunit une sélection minutieuse de photographies du ciel profond, de comètes et de panoramas nocturnes. Chaque planche est accompagnée de notes astronomiques, de récits de terrain et de repères pour guider votre regard vers l'infini. Imprimé avec le plus grand soin sur papier d'art à fort grammage pour restituer la profondeur des noirs cosmiques.`,
        highlights: [
            "Plus de 190 pages de photographies haute définition d'astronomie",
            'Reliure cartonnée rigide avec marquage or à chaud',
            "Papier couché d'art 170g haute fidélité quadrichromie",
            'Tirage soigné et numéroté, expédié dans un étui cartonné renforcé',
        ],
        specs: [
            { label: 'Format', value: '21 × 29,7 cm (A4 à la française, relié)' },
            { label: 'Pagination', value: "192 pages d'art" },
            { label: 'Papier intérieur', value: 'Couché demi-mat 170 g/m²' },
            { label: 'Finition couverture', value: 'Rigide rembordée, pelliculage soft-touch et dorure or à chaud' },
            { label: 'Impression', value: 'Quadrichromie haute trame anti-reflet' },
            { label: 'Langue', value: 'Français' },
            { label: 'Poids', value: 'Environ 850 g' },
        ],
        images: [
            {
                src: '/images/shop/livre-miroirs-polaires.jpg',
                alt: "Couverture du livre d'art Miroirs Polaires",
                isCover: true,
                caption: 'Couverture rigide toilée avec dorure or à chaud et tranche dorée',
            },
        ],
    },
    shippingCarriers: [
        {
            id: 'mondial_relay',
            name: 'Mondial Relay',
            description: 'Livraison en point relais commerçant sous 3 à 5 jours ouvrés',
            // WARNING: plancher légal des livres neufs expédiés (loi Darcos) : 0,01 € dès 35 € de commande,
            // 3 € en dessous. Si le prix du livre passe sous 35 €, ce tarif devient illégal.
            // POURQUOI 0,01 € : offre de lancement, le coût réel de l'envoi reste à la charge du vendeur.
            price: 0.01,
            enabled: true,
            type: 'relay',
            estimatedDays: '3 à 5 jours',
        },
        {
            id: 'remise_main_propre',
            name: 'Remise en main propre',
            description:
                "Sur demande, avec le code envoyé par l'auteur une fois la demande acceptée. Lieu et date à convenir ensemble.",
            price: 0,
            enabled: true,
            type: 'pickup',
            requiresPriorAgreement: true,
        },
    ],
};

/**
 * Récupère un transporteur actif à partir de son identifiant technique.
 * @param carrierId - Identifiant unique du transporteur ('mondial_relay', etc.)
 * @returns Le transporteur correspondant s'il est actif, sinon undefined.
 */
export function getActiveCarrier(carrierId: string): ShippingCarrier | undefined {
    return SHOP_CONFIG.shippingCarriers.find((carrier) => carrier.id === carrierId && carrier.enabled);
}

/**
 * Calcule le montant total TTC d'une commande (livre + frais de port).
 * @param carrierId - Identifiant du transporteur choisi
 * @returns Montant total en euros, ou null si le transporteur est invalide ou désactivé
 */
export function calculateOrderTotal(carrierId: string): number | null {
    const carrier = getActiveCarrier(carrierId);
    if (!carrier) return null;
    return Number((SHOP_CONFIG.book.price + carrier.price).toFixed(2));
}

/**
 * Vérifie si la boutique est activée via la variable d'environnement ENABLE_BOUTIQUE.
 *
 * POURQUOI :
 * Permet de masquer entièrement la boutique (menus, pages et API de paiement)
 * tant qu'elle n'est pas officiellement lancée, ou pour des périodes de maintenance.
 *
 * OPTIONS ET EXEMPLES :
 * - Activer la boutique dans le fichier `.env` :
 *   `ENABLE_BOUTIQUE=true` (ou `enable_boutique=true` ou `PUBLIC_ENABLE_BOUTIQUE=true`)
 * - Désactiver la boutique :
 *   Supprimer la variable du `.env`, ou lui affecter `ENABLE_BOUTIQUE=false`.
 *
 * @returns true si la variable est explicitement définie à 'true' (insensible à la casse), false sinon.
 */
export function isBoutiqueEnabled(): boolean {
    const envVal =
        (typeof process !== 'undefined' && process.env
            ? (process.env.ENABLE_BOUTIQUE ?? process.env.enable_boutique ?? process.env.PUBLIC_ENABLE_BOUTIQUE)
            : undefined) ??
        import.meta.env?.ENABLE_BOUTIQUE ??
        import.meta.env?.enable_boutique ??
        import.meta.env?.PUBLIC_ENABLE_BOUTIQUE;

    return (
        String(envVal ?? '')
            .trim()
            .toLowerCase() === 'true'
    );
}
