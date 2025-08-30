// SPDX-License-Identifier: CC0-1.0
//
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

import js from "@eslint/js";
import globals from "globals";
import {defineConfig} from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
    {
        files: ["*.{js,mjs,cjs}"],
        plugins: {js},
        extends: ["js/recommended"],
        languageOptions: {globals: globals.node}
    },
    {files: ["**/*.js"], languageOptions: {sourceType: "commonjs"}},
    eslintConfigPrettier,
]);
