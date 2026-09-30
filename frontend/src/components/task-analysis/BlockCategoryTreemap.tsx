// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { useEffect, useRef, useState } from 'react';
import type { ScratchPaletteColour } from '../../lib/program-concepts';
import { NARROWEST_BOX, placeTreemap, type TreemapBox } from './treemap-layout';

export interface TreemapEntry {
    key: string;
    colour: ScratchPaletteColour;
    name: string;
    value: string;
    title: string;
    weight: number;
}

function useMeasuredBox(): [TreemapBox, (node: HTMLDivElement | null) => void] {
    const [box, setBox] = useState<TreemapBox>(NARROWEST_BOX);
    const node = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const element = node.current;
        if (!element || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            const { width, height } = element.getBoundingClientRect();
            if (width <= 0 || height <= 0) return;
            setBox((current) =>
                current.width === width && current.height === height ? current : { width, height },
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [
        box,
        (element) => {
            node.current = element;
        },
    ];
}

export function BlockCategoryTreemap({
    entries,
    unplotted,
    label,
    unnamedLead,
}: {
    entries: readonly TreemapEntry[];
    unplotted: readonly TreemapEntry[];
    label: string;
    unnamedLead: string;
}) {
    const [box, measure] = useMeasuredBox();
    const placements = placeTreemap(entries, box);
    const unnamed = [
        ...entries.filter((_, index) => placements[index].tier !== 'full'),
        ...unplotted,
    ];

    return (
        <>
            <div className="task-blocks-treemap" ref={measure} role="img" aria-label={label}>
                {entries.map((entry, index) => {
                    const { tile, tier } = placements[index];
                    return (
                        <div
                            key={entry.key}
                            aria-hidden="true"
                            title={entry.title}
                            className={`task-blocks-tile task-blocks-tile-${tier}`}
                            style={{
                                left: `${tile.x}%`,
                                top: `${tile.y}%`,
                                width: `${tile.width}%`,
                                height: `${tile.height}%`,
                                background: `var(--scratch-${entry.colour})`,
                                color: `var(--scratch-${entry.colour}-ink)`,
                            }}
                        >
                            {tier !== 'none' && (
                                <span className="task-blocks-tile-name">{entry.name}</span>
                            )}
                            {tier === 'full' && (
                                <span className="task-blocks-tile-value">{entry.value}</span>
                            )}
                        </div>
                    );
                })}
            </div>
            {unnamed.length > 0 && (
                <div className="task-blocks-unnamed" aria-hidden="true">
                    <p className="task-blocks-unnamed-lead">{unnamedLead}</p>
                    <ul className="task-blocks-unnamed-list">
                        {unnamed.map((entry) => (
                            <li key={entry.key} className="task-blocks-unnamed-entry">
                                <span
                                    className="task-blocks-swatch"
                                    style={{ background: `var(--scratch-${entry.colour})` }}
                                />
                                <span className="task-blocks-unnamed-name">{entry.name}</span>
                                <span className="task-blocks-unnamed-value">{entry.value}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
}
