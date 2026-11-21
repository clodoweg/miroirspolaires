/**
 * Substitut de test du module virtuel `astro:middleware` (aliasé dans vitest.config.ts).
 */

export const defineMiddleware = <T>(handler: T): T => handler;
