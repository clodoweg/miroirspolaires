/**
 * @file src/config/shop.test.ts
 * @description Tests unitaires pour la configuration et les calculs de la boutique.
 */
import { describe, it, expect } from 'vitest';
import { SHOP_CONFIG, getActiveCarrier, calculateOrderTotal } from './shop';

describe('Configuration Boutique (Shop Config)', () => {
    it('définit un livre avec les informations obligatoires', () => {
        expect(SHOP_CONFIG.book).toBeDefined();
        expect(SHOP_CONFIG.book.title).toContain('Miroirs Polaires');
        expect(SHOP_CONFIG.book.price).toBeGreaterThan(0);
        expect(SHOP_CONFIG.book.currency).toBe('EUR');
        expect(SHOP_CONFIG.book.specs.length).toBeGreaterThan(0);
        expect(SHOP_CONFIG.book.images.length).toBeGreaterThan(0);
    });

    it('fournit au moins deux transporteurs actifs par défaut', () => {
        const active = SHOP_CONFIG.shippingCarriers.filter((c) => c.enabled);
        expect(active.length).toBeGreaterThanOrEqual(2);
        expect(active.some((c) => c.type === 'relay')).toBe(true);
        expect(active.some((c) => c.type === 'pickup')).toBe(true);
    });

    it('getActiveCarrier retrouve un transporteur activé par son identifiant', () => {
        const mondialRelay = getActiveCarrier('mondial_relay');
        expect(mondialRelay).toBeDefined();
        expect(mondialRelay?.name).toBe('Mondial Relay');
        expect(mondialRelay?.price).toBe(0.01);

        const handDelivery = getActiveCarrier('remise_main_propre');
        expect(handDelivery?.name).toBe('Remise en main propre');
        expect(handDelivery?.requiresPriorAgreement).toBe(true);

        expect(getActiveCarrier('colissimo_domicile')).toBeUndefined();
    });

    it('respecte le plancher légal des frais de port sur les livres expédiés', () => {
        const legalMinimum = SHOP_CONFIG.book.price >= 35 ? 0.01 : 3;
        const shippedCarriers = SHOP_CONFIG.shippingCarriers.filter((c) => c.enabled && c.type === 'relay');
        expect(shippedCarriers.length).toBeGreaterThan(0);
        for (const carrier of shippedCarriers) {
            expect(carrier.price).toBeGreaterThanOrEqual(legalMinimum);
        }
    });

    it('getActiveCarrier renvoie undefined pour un identifiant inconnu', () => {
        const unknown = getActiveCarrier('transporteur_inconnu');
        expect(unknown).toBeUndefined();
    });

    it('calculateOrderTotal calcule fidèlement le montant total (livre + port)', () => {
        const totalMondialRelay = calculateOrderTotal('mondial_relay');
        expect(totalMondialRelay).toBe(39.01);

        const totalHandDelivery = calculateOrderTotal('remise_main_propre');
        expect(totalHandDelivery).toBe(39.0);
    });

    it('calculateOrderTotal renvoie null pour un transporteur inexistant', () => {
        const totalInvalid = calculateOrderTotal('inexistant');
        expect(totalInvalid).toBeNull();
    });
});

describe('Activation de la Boutique (isBoutiqueEnabled & getNavItems)', () => {
    it('considère la boutique désactivée par défaut si la variable est absente ou vide', async () => {
        const originalEnv = process.env.ENABLE_BOUTIQUE;
        const originalLower = process.env.enable_boutique;
        const originalPublic = process.env.PUBLIC_ENABLE_BOUTIQUE;
        try {
            delete process.env.ENABLE_BOUTIQUE;
            delete process.env.enable_boutique;
            delete process.env.PUBLIC_ENABLE_BOUTIQUE;

            const { isBoutiqueEnabled } = await import('./shop');
            expect(isBoutiqueEnabled()).toBe(false);

            const { getNavItems } = await import('./navigation');
            const items = getNavItems();
            expect(items.some((i) => i.label === 'Boutique')).toBe(false);
        } finally {
            if (originalEnv !== undefined) process.env.ENABLE_BOUTIQUE = originalEnv;
            if (originalLower !== undefined) process.env.enable_boutique = originalLower;
            if (originalPublic !== undefined) process.env.PUBLIC_ENABLE_BOUTIQUE = originalPublic;
        }
    });

    it('considère la boutique activée quand ENABLE_BOUTIQUE vaut "true"', async () => {
        const originalEnv = process.env.ENABLE_BOUTIQUE;
        try {
            process.env.ENABLE_BOUTIQUE = 'true';

            const { isBoutiqueEnabled } = await import('./shop');
            expect(isBoutiqueEnabled()).toBe(true);

            const { getNavItems } = await import('./navigation');
            const items = getNavItems();
            expect(items.some((i) => i.label === 'Boutique')).toBe(true);
        } finally {
            if (originalEnv !== undefined) {
                process.env.ENABLE_BOUTIQUE = originalEnv;
            } else {
                delete process.env.ENABLE_BOUTIQUE;
            }
        }
    });

    it('gère les minuscules "enable_boutique" et les espaces/majuscules', async () => {
        const originalEnv = process.env.ENABLE_BOUTIQUE;
        const originalLower = process.env.enable_boutique;
        try {
            delete process.env.ENABLE_BOUTIQUE;
            process.env.enable_boutique = ' TRUE ';

            const { isBoutiqueEnabled } = await import('./shop');
            expect(isBoutiqueEnabled()).toBe(true);
        } finally {
            if (originalEnv !== undefined) process.env.ENABLE_BOUTIQUE = originalEnv;
            if (originalLower !== undefined) {
                process.env.enable_boutique = originalLower;
            } else {
                delete process.env.enable_boutique;
            }
        }
    });

    it('renvoie false si la variable est définie à "false", "0" ou une autre valeur', async () => {
        const originalEnv = process.env.ENABLE_BOUTIQUE;
        try {
            process.env.ENABLE_BOUTIQUE = 'false';
            const { isBoutiqueEnabled } = await import('./shop');
            expect(isBoutiqueEnabled()).toBe(false);

            process.env.ENABLE_BOUTIQUE = '0';
            expect(isBoutiqueEnabled()).toBe(false);

            process.env.ENABLE_BOUTIQUE = 'disabled';
            expect(isBoutiqueEnabled()).toBe(false);
        } finally {
            if (originalEnv !== undefined) {
                process.env.ENABLE_BOUTIQUE = originalEnv;
            } else {
                delete process.env.ENABLE_BOUTIQUE;
            }
        }
    });
});
