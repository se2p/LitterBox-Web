// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import type { ReactNode } from 'react';

interface FormFieldProps {
    label: ReactNode;
    labelFor: string;
    hint?: ReactNode;
    children: ReactNode;
}

export function FormField({ label, labelFor, hint, children }: FormFieldProps) {
    return (
        <div className="form-field">
            <label htmlFor={labelFor}>{label}</label>
            {children}
            {hint && <p className="hint">{hint}</p>}
        </div>
    );
}
