// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { HTMLAttributes, ReactNode } from 'react';

interface PageMainProps extends HTMLAttributes<HTMLElement> {
    children: ReactNode;
}

export function PageMain({
    children,
    className = '',
    id = 'main-content',
    ...props
}: PageMainProps) {
    return (
        <main id={id} className={`page-content ${className}`.trim()} tabIndex={-1} {...props}>
            {children}
        </main>
    );
}
