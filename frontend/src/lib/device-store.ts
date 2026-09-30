// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

export const storage = (): Storage | undefined => {
    if (typeof window === 'undefined') return undefined;
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
};

export const readRaw = (key: string): string | null => {
    const store = storage();
    if (!store) return null;
    try {
        return store.getItem(key);
    } catch {
        return null;
    }
};

/** A stored entry's timestamp, or undefined when it is not a positive finite number. */
export const storedTimestamp = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export const readValidatedList = <T>(
    key: string,
    validEntry: (value: unknown) => T | undefined,
): T[] => {
    const store = storage();
    if (!store) return [];
    try {
        const raw = store.getItem(key);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(validEntry).filter((entry): entry is T => entry !== undefined);
    } catch {
        return [];
    }
};

export const writeList = <T>(key: string, entries: readonly T[]): void => {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(key, JSON.stringify(entries));
    } catch {
        return;
    }
};
