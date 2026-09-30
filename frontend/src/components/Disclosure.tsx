// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ReactNode } from 'react';

export function Disclosure({
    expanded,
    controls,
    onClick,
    ariaLabel,
    className,
    variant = 'row',
    children,
}: {
    expanded: boolean;
    controls?: string;
    onClick: () => void;
    ariaLabel?: string;
    className?: string;
    variant?: 'row' | 'chip' | 'inline';
    children: ReactNode;
}) {
    const chip = variant === 'chip';
    const base =
        variant === 'inline'
            ? 'disclosure-inline'
            : chip
              ? 'issue-choice disclosure-chip'
              : 'disclosure-row';
    const marker =
        variant === 'inline'
            ? 'disclosure-inline-marker'
            : chip
              ? 'disclosure-chip-marker'
              : 'disclosure-row-marker';
    return (
        <button
            type="button"
            className={className ? `${base} ${className}` : base}
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={ariaLabel}
            onClick={onClick}
        >
            <span className={marker} aria-hidden="true">
                {expanded ? '▾' : '▸'}
            </span>
            {children}
        </button>
    );
}
