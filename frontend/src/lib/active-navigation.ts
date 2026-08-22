// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { createContext, useContext, useEffect } from 'react';

/**
 * Which menu entry the page currently on screen belongs to.
 *
 * Most pages are their own menu entry and the path says so. A result page is not: /submissions/{token} is reached
 * from the single-project form and from the class set alike, and only the result itself knows which. Rather than
 * teaching the menu to read tokens, the page says where it came from.
 */
const DeclaredNavigation = createContext<(path: string | undefined) => void>(() => {});

export const DeclaredNavigationProvider = DeclaredNavigation.Provider;

/**
 * Claim a menu entry for as long as this page is on screen. Passing nothing leaves the menu to work it out from the
 * address, which is the right answer everywhere the address is enough.
 */
export function useDeclaredNavigation(path: string | undefined): void {
    const declare = useContext(DeclaredNavigation);
    useEffect(() => {
        declare(path);
        return () => declare(undefined);
    }, [declare, path]);
}
