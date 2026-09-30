// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

const TREEMAP_LAYOUT_ASPECT = 2;

export interface TreemapBox {
    width: number;
    height: number;
}

export const NARROWEST_BOX: TreemapBox = { width: 288, height: 208 };

// Keep these in sync with `.task-blocks-tile` in task-analysis.css.
const FULL_NAME_FONT_PX = 15.2;
const NAME_FONT_PX = 11.52;
const VALUE_FONT_PX = 13.6;
const TILE_PADDING_PX = 8;
const GLYPH_WIDTH_RATIO = 0.62;
const LINE_HEIGHT = 1.2;

export type TileLabelTier = 'full' | 'name' | 'none';

function nameFootprint(
    words: readonly string[],
    fontPx: number,
): { width: number; height: number } {
    const longestWord = Math.max(...words.map((word) => word.length));
    return {
        width: longestWord * fontPx * GLYPH_WIDTH_RATIO + TILE_PADDING_PX,
        height: words.length * fontPx * LINE_HEIGHT + TILE_PADDING_PX,
    };
}

export function tileLabelTier(
    tile: TreemapTile,
    name: string,
    value: string,
    box: TreemapBox = NARROWEST_BOX,
): TileLabelTier {
    const words = name.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return 'none';
    const widthPx = (tile.width / 100) * box.width;
    const heightPx = (tile.height / 100) * box.height;

    const valueWidth = value.length * VALUE_FONT_PX * GLYPH_WIDTH_RATIO + TILE_PADDING_PX;

    const fullName = nameFootprint(words, FULL_NAME_FONT_PX);
    const fullHeight = fullName.height + VALUE_FONT_PX * LINE_HEIGHT;
    if (widthPx >= Math.max(fullName.width, valueWidth) && heightPx >= fullHeight) return 'full';

    const plainName = nameFootprint(words, NAME_FONT_PX);
    if (widthPx >= plainName.width && heightPx >= plainName.height) return 'name';

    return 'none';
}

export interface TreemapTile {
    x: number;
    y: number;
    width: number;
    height: number;
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const worstAspect = (areas: readonly number[], side: number): number => {
    const sum = areas.reduce((total, area) => total + area, 0);
    if (sum <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
    const largest = Math.max(...areas);
    const smallest = Math.min(...areas);
    return Math.max((side * side * largest) / (sum * sum), (sum * sum) / (side * side * smallest));
};

export function squarifiedTreemap(
    values: readonly number[],
    aspect: number = TREEMAP_LAYOUT_ASPECT,
): TreemapTile[] {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (values.length === 0 || total <= 0) return [];

    const boxWidth = aspect;
    const boxHeight = 1;
    const order = values
        .map((_, index) => index)
        .sort((left, right) => values[right] - values[left]);
    const areas = order.map((index) => (values[index] / total) * boxWidth * boxHeight);

    const tiles: TreemapTile[] = new Array(values.length);
    let x = 0;
    let y = 0;
    let width = boxWidth;
    let height = boxHeight;
    let row: number[] = [];
    let rowStart = 0;

    const placeRow = () => {
        const sum = row.reduce((subtotal, area) => subtotal + area, 0);
        if (width >= height) {
            const columnWidth = sum / height;
            let offset = y;
            row.forEach((area, index) => {
                const tileHeight = area / columnWidth;
                tiles[order[rowStart + index]] = {
                    x,
                    y: offset,
                    width: columnWidth,
                    height: tileHeight,
                };
                offset += tileHeight;
            });
            x += columnWidth;
            width -= columnWidth;
        } else {
            const rowHeight = sum / width;
            let offset = x;
            row.forEach((area, index) => {
                const tileWidth = area / rowHeight;
                tiles[order[rowStart + index]] = {
                    x: offset,
                    y,
                    width: tileWidth,
                    height: rowHeight,
                };
                offset += tileWidth;
            });
            y += rowHeight;
            height -= rowHeight;
        }
        rowStart += row.length;
        row = [];
    };

    for (const area of areas) {
        const side = Math.min(width, height);
        if (row.length === 0 || worstAspect([...row, area], side) <= worstAspect(row, side)) {
            row.push(area);
        } else {
            placeRow();
            row.push(area);
        }
    }
    if (row.length > 0) placeRow();

    return tiles.map((tile) => ({
        x: round((tile.x / boxWidth) * 100),
        y: round((tile.y / boxHeight) * 100),
        width: round((tile.width / boxWidth) * 100),
        height: round((tile.height / boxHeight) * 100),
    }));
}

export interface TreemapPlacement {
    tile: TreemapTile;
    tier: TileLabelTier;
}

export function placeTreemap(
    entries: readonly { name: string; value: string; weight: number }[],
    box: TreemapBox = NARROWEST_BOX,
): TreemapPlacement[] {
    const tiles = squarifiedTreemap(
        entries.map((entry) => entry.weight),
        box.width / box.height,
    );
    return entries.map((entry, index) => ({
        tile: tiles[index],
        tier: tileLabelTier(tiles[index], entry.name, entry.value, box),
    }));
}
