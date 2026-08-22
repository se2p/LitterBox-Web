// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { CatalogueBlockSet } from './catalogue-utils';

/** A small decorative mark for the block ecosystem named beside it. */
export function BlockSetIcon({ blockSet }: { blockSet: CatalogueBlockSet }) {
    return (
        <svg
            className={`block-set-icon block-set-icon-${blockSet}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {blockSet === 'scratch' && (
                <path d="M5.2 8.2h4.1a2.7 2.7 0 1 1 5.4 0h4.1v4.1a2.7 2.7 0 1 1 0 5.4h-4.1v4.1h-4.1v-4.1H6.5a2.7 2.7 0 1 1 0-5.4h-1.3z" />
            )}
            {blockSet === 'qscratch' && (
                <>
                    <ellipse cx="12" cy="12" rx="9.2" ry="3.8" />
                    <ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(60 12 12)" />
                    <ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(120 12 12)" />
                    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
                </>
            )}
            {blockSet === 'mblock' && (
                <>
                    <path d="M7 9.2h10a2 2 0 0 1 2 2v6.1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.1a2 2 0 0 1 2-2z" />
                    <path d="M9 9.2V6.8h6v2.4M12 3.4v3.4M5 13H2.8M21.2 13H19" />
                    <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
                    <path d="M9 17h6" />
                </>
            )}
        </svg>
    );
}
