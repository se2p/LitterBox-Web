// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
import { useId } from 'react';
import type { ReactNode, TableHTMLAttributes } from 'react';
import type { SortDirection } from '../lib/useSortState';

export type { SortDirection };

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
    caption: ReactNode;
    captionClassName?: string;
    children: ReactNode;
}

export function DataTable({
    caption,
    captionClassName,
    children,
    className = '',
    ...props
}: DataTableProps) {
    const captionId = useId();
    return (
        <div className="table-region" role="region" aria-labelledby={captionId} tabIndex={0}>
            <table className={`data-table ${className}`.trim()} {...props}>
                <caption id={captionId} className={captionClassName}>
                    {caption}
                </caption>
                {children}
            </table>
        </div>
    );
}

export function SortableColumnHeader({
    label,
    direction,
    onSort,
    className,
    spokenDirection,
}: {
    label: ReactNode;
    direction: SortDirection | undefined;
    onSort: () => void;
    className?: string;
    spokenDirection?: Record<SortDirection, string>;
}) {
    return (
        <th scope="col" className={className} aria-sort={direction ?? 'none'}>
            <button type="button" className="table-sort" onClick={onSort}>
                {label}
                <span aria-hidden="true" className="table-sort-mark">
                    {direction === undefined ? '↕' : direction === 'ascending' ? '▲' : '▼'}
                </span>
                {direction !== undefined && spokenDirection && (
                    <span className="visually-hidden"> {spokenDirection[direction]}</span>
                )}
            </button>
        </th>
    );
}
