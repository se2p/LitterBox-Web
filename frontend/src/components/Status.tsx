// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone =
    | 'cancelled'
    | 'completed'
    | 'error'
    | 'failed'
    | 'neutral'
    | 'partial'
    | 'processing'
    | 'queued'
    | 'ready';

interface StatusIndicatorProps extends HTMLAttributes<HTMLParagraphElement> {
    label: ReactNode;
    tone?: StatusTone;
    role?: 'status' | 'alert';
}

export function StatusIndicator({
    label,
    tone = 'neutral',
    role = 'status',
    className = '',
    ...props
}: StatusIndicatorProps) {
    return (
        <p className={`status-line status-${tone} ${className}`.trim()} role={role} {...props}>
            <span aria-hidden="true" className="status-dot" />
            <span>{label}</span>
        </p>
    );
}
