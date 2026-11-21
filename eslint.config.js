/**
 * Configuration ESLint (flat config) du dépôt
 *
 * Responsabilité : vérifier la justesse du code (TypeScript, règles des hooks React,
 * accessibilité JSX et Astro). Aucune règle de style : la mise en forme relève de Prettier.
 *
 * POURQUOI `eslint-plugin-jsx-a11y-x` : le plugin historique `eslint-plugin-jsx-a11y`
 * n'accepte pas ESLint 10 en dépendance de pair ; ce fork reprend les mêmes règles
 * et `eslint-plugin-astro` sait l'utiliser pour ses règles a11y des fichiers .astro.
 */

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import globals from 'globals';

export default defineConfig([
    globalIgnores([
        'dist/',
        '.vercel/',
        '.astro/',
        'coverage/',
        'temp/',
        'node_modules/',
        // POURQUOI : code tiers compilé (moteur Stellarium, Pannellum), pas maintenu ici.
        'public/js/',
        'public/libs/',
        'workers/**/node_modules/',
        'workers/**/.wrangler/',
    ]),
    js.configs.recommended,
    tseslint.configs.recommended,
    astro.configs.recommended,
    astro.configs['jsx-a11y-recommended'],
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            // POURQUOI : ~200 `any` hérités, surtout autour des réponses d'API tierces ; on les
            // signale sans bloquer, et tout nouveau code doit typer ses données.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['**/*.{tsx,jsx}'],
        extends: [reactHooks.configs.flat.recommended, jsxA11y.configs.recommended],
        rules: {
            // POURQUOI : règle heuristique du React Compiler ; les chargements au montage
            // (fetch puis setState) sont légitimes ici. Signalée, non bloquante.
            'react-hooks/set-state-in-effect': 'warn',
        },
    },
    {
        files: ['**/*.{js,cjs}'],
        rules: {
            // POURQUOI : les scripts .cjs et quelques .js utilisent require() légitimement.
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
]);
