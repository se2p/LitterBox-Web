// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';

export function FoldSection({
    id,
    title,
    number,
    description,
    open,
    onToggle,
    children,
    className = 'fold-section',
}: {
    id: string;
    title: ReactNode;
    number?: number;
    description?: ReactNode;
    open: boolean;
    onToggle: (id: string, open: boolean) => void;
    children: ReactNode;
    className?: string;
}) {
    const numbered = number !== undefined;
    return (
        <details
            id={id}
            className={numbered ? `${className} section-card` : className}
            open={open}
            onToggle={(event) => onToggle(id, event.currentTarget.open)}
        >
            <summary
                className={numbered ? 'section-card-heading' : 'fold-section-summary'}
                data-section-number={number}
            >
                {numbered ? (
                    <div>
                        {title}
                        {description !== undefined && <p>{description}</p>}
                    </div>
                ) : (
                    title
                )}
            </summary>
            <div className={numbered ? 'fold-section-body section-card-body' : 'fold-section-body'}>
                {children}
            </div>
        </details>
    );
}
