// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { defineConfig, devices } from '@playwright/test';

const assembledBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/warm-up.ts',
    // A CI runner shares its cores between four workers and a freshly started server.
    expect: { timeout: process.env.CI ? 15_000 : 5_000 },
    ...(assembledBaseUrl
        ? {}
        : {
              webServer: {
                  command: 'npm run dev -- --host 127.0.0.1',
                  url: 'http://127.0.0.1:5173/litterbox/',
                  reuseExistingServer: true,
              },
          }),
    use: {
        baseURL: assembledBaseUrl ?? 'http://127.0.0.1:5173/litterbox/',
        ...devices['Desktop Chrome'],
    },
});
