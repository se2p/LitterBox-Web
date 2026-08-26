// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/*
 * A page reached through a lazy route is not on screen until its chunk has been fetched and run. On a
 * developer's machine that is imperceptible; on a shared runner under load it is not, and one second — the
 * default a findBy… query waits — is not enough. Waiting longer costs nothing when the element arrives
 * promptly, and the alternative is a suite that fails on the runner and passes everywhere else.
 */
configure({ asyncUtilTimeout: 10_000 });

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () =>
        ({
            measureText: () => ({ width: 10 }),
        }) as unknown as CanvasRenderingContext2D,
});

let hasLocalStorage: boolean;
try {
    hasLocalStorage = Boolean(window.localStorage);
} catch {
    hasLocalStorage = false;
}

if (!hasLocalStorage) {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
        } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>,
    });
}
