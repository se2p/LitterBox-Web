/* SPDX-License-Identifier: EUPL-1.2 */
/* SPDX-FileCopyrightText: 2025 LitterBox-Web contributors */
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'playwright-report', 'test-results'] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['prettier.config.cjs', 'scripts/**/*.mjs'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
);
