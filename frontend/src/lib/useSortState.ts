// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useState } from 'react';

export type SortDirection = 'ascending' | 'descending';

export interface SortState<Column> {
    column: Column;
    direction: SortDirection;
}

const flipped = (direction: SortDirection): SortDirection =>
    direction === 'ascending' ? 'descending' : 'ascending';

export function useSortState<Column>(
    initial: SortState<Column>,
    defaultDirection?: (column: Column) => SortDirection,
): { sort: SortState<Column>; toggle: (column: Column) => void; reset: () => void };
export function useSortState<Column>(
    initial?: undefined,
    defaultDirection?: (column: Column) => SortDirection,
): { sort: SortState<Column> | undefined; toggle: (column: Column) => void; reset: () => void };
export function useSortState<Column>(
    initial?: SortState<Column>,
    defaultDirection: (column: Column) => SortDirection = () => 'ascending',
) {
    const [sort, setSort] = useState(initial);
    const toggle = (column: Column) =>
        setSort((current) =>
            current?.column === column
                ? { column, direction: flipped(current.direction) }
                : { column, direction: defaultDirection(column) },
        );
    return { sort, toggle, reset: () => setSort(initial) };
}
