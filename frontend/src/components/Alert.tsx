// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { HTMLAttributes, ReactNode } from 'react';

type AlertTone = 'error' | 'info' | 'success' | 'warning';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
    tone?: AlertTone;
    role?: 'alert' | 'status';
    children: ReactNode;
}

export function Alert({
    tone = 'info',
    role = 'alert',
    className = '',
    children,
    ...props
}: AlertProps) {
    return (
        <div className={`alert alert-${tone} ${className}`.trim()} role={role} {...props}>
            {children}
        </div>
    );
}
