// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { HTMLAttributes, ReactNode } from 'react';

export interface DefinitionItem {
    label: ReactNode;
    value: ReactNode;
}

export function DefinitionList({
    items,
    className = '',
    ...props
}: { items: DefinitionItem[] } & HTMLAttributes<HTMLDListElement>) {
    return (
        <dl className={`data-list ${className}`.trim()} {...props}>
            {items.map((item, index) => (
                <div key={index}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}
