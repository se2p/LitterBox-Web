// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useId } from 'react';
import type { ReactNode, TableHTMLAttributes } from 'react';

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
    caption: ReactNode;
    children: ReactNode;
}

export function DataTable({ caption, children, className = '', ...props }: DataTableProps) {
    const captionId = useId();
    return (
        <div className="table-region" role="region" aria-labelledby={captionId} tabIndex={0}>
            <table className={`data-table ${className}`.trim()} {...props}>
                <caption id={captionId}>{caption}</caption>
                {children}
            </table>
        </div>
    );
}
