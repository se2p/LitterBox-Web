// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';

export function useIdSet(initial: Iterable<string> = []): {
    has: (id: string) => boolean;
    set: (id: string, on: boolean) => void;
    toggle: (id: string) => void;
} {
    const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(initial));
    const set = (id: string, on: boolean) =>
        setIds((current) => {
            if (current.has(id) === on) return current;
            const next = new Set(current);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });
    return {
        has: (id) => ids.has(id),
        set,
        toggle: (id) =>
            setIds((current) => {
                const next = new Set(current);
                if (!next.delete(id)) next.add(id);
                return next;
            }),
    };
}
