/**
 * Configuration ESLint (flat config) du dépôt
 *
 * Responsabilité : vérifier la justesse du code (TypeScript, règles des hooks React,
 * accessibilité JSX et Astro). Aucune règle de style : la mise en forme relève de Prettier.
 *
 * POURQUOI `eslint-plugin-jsx-a11y-x` : le plugin historique `eslint-plugin-jsx-a11y`
 * n'accepte pas ESLint 10 en dépendance de pair ; ce fork reprend les mêmes règles
 * et `eslint-plugin-astro` sait l'utiliser pour ses règles a11y des fichiers .astro.
 *
 * Sécurité et bugs (en complément de CodeQL, qui ne lit pas les fichiers .astro) :
 * - `no-unsanitized` refuse `innerHTML`, `insertAdjacentHTML`, `document.write`, `import()`… alimentés par
 *   une valeur calculée, y compris dans les `<script>` des fichiers .astro.
 * - Un sous-ensemble de `eslint-plugin-sonarjs` limité à la détection de bugs (`SONARJS_BUG_RULES`).
 *   POURQUOI pas sa configuration recommandée : 322 remarques, surtout de style et de complexité.
 */

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

// POURQUOI : règles qui signalent des erreurs de logique (branches ou conditions identiques, valeur de retour
// ignorée…), sans bruit de style. Aucune ne se déclenche sur le code actuel : elles bloquent les régressions.
const SONARJS_BUG_RULES = [
    'array-callback-without-return',
    'no-all-duplicated-branches',
    'no-alphabetical-sort',
    'no-array-delete',
    'no-collection-size-mischeck',
    'no-element-overwrite',
    'no-empty-collection',
    'no-equals-in-for-termination',
    'no-gratuitous-expressions',
    'no-identical-conditions',
    'no-identical-expressions',
    'no-ignored-return',
    'no-in-misuse',
    'no-incorrect-string-concat',
    'no-inverted-boolean-check',
    'no-invariant-returns',
    'no-misleading-array-reverse',
    'no-same-argument-assert',
    'no-unthrown-error',
    'no-use-of-empty-return-value',
    'non-existent-operator',
];

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
        plugins: { sonarjs },
        rules: Object.fromEntries(SONARJS_BUG_RULES.map((rule) => [`sonarjs/${rule}`, 'error'])),
    },
    noUnsanitized.configs.recommended,
    {
        rules: {
            // WARNING: sécurité. N'ajouter ici qu'une fonction qui garantit la sûreté de sa valeur
            // (`toSameOriginModuleUrl` refuse tout module hors du site, `AladinViewer.tsx`).
            'no-unsanitized/method': ['error', { escape: { methods: ['toSameOriginModuleUrl'] } }],
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
