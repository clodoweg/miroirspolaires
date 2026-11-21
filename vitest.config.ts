import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.tsx'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/.vercel/**', '**/temp/**', 'src/test/**'],
        alias: {
            '@': path.resolve(__dirname, './src'),
            'astro:content': path.resolve(__dirname, './src/test/mocks/astro-content.ts'),
            'astro:middleware': path.resolve(__dirname, './src/test/mocks/astro-middleware.ts'),
        },
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'json-summary', 'html'],
            reportsDirectory: './coverage',
            // POURQUOI : périmètre explicite sur lequel portent les seuils (logique métier, config et
            // routes API) ; les composants et pages sont vérifiés par les tests et les captures.
            include: ['src/lib/**', 'src/utils/**', 'src/config/**', 'src/pages/api/**'],
            exclude: ['**/*.test.*', '**/_*.test.*', 'src/test/**'],
            thresholds: {
                lines: 80,
                functions: 80,
                statements: 80,
                branches: 70,
            },
        },
    },
});
