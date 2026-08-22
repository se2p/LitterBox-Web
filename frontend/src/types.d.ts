// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
declare module 'scratchblocks' {
    export function parse(source: string): unknown;
    export function render(source: string, options?: Record<string, unknown>): string;
}

declare module 'scratchblocks/index.js' {
    const createRenderer: (windowObject: Window) => unknown;
    export default createRenderer;
}

declare module 'scratchblocks/scratch3/style.css.js' {
    const css: string;
    export default css;
}
