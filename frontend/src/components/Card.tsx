// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { HTMLAttributes, ReactNode } from 'react';

type CardElement = 'article' | 'div' | 'section';

interface CardProps extends HTMLAttributes<HTMLElement> {
    as?: CardElement;
    children: ReactNode;
}

export function Card({ as = 'section', className = '', children, ...props }: CardProps) {
    const Element = as;
    return (
        <Element className={`card ${className}`.trim()} {...props}>
            {children}
        </Element>
    );
}
