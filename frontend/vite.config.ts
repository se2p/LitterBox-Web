// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    base: '/litterbox/',
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        globals: true,
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        // These render whole pages and drive them as a reader would, which takes a second of the slowest of them
        // here and several times that on a runner sharing its cores. The default budget of five seconds left a
        // dozen of them within a small multiple of failing for being on a busy machine rather than for being
        // wrong. Long enough to absorb that, and still short enough that something genuinely stuck says so.
        testTimeout: 15_000,
    },
    server: {
        proxy: {
            '/litterbox/api': {
                target: 'http://localhost:8080',
            },
        },
    },
});
