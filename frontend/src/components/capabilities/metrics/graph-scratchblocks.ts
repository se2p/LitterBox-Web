// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import {
    normalizeScratchblocksTransforms,
    prepareScratchblocks,
} from '../../../lib/scratchblocks-runtime';
import { scratchblocksLanguages } from '../../single-project/scratchblocks-source';

/** Graphviz gives these two nodes no program text, so there is nothing to draw blocks for. */
const STRUCTURAL_LABELS = new Set(['entry', 'exit']);

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

interface NodeText {
    lines: string[];
    centerX: number;
    centerY: number;
}

const readNodeText = (node: Element): NodeText | undefined => {
    const texts = Array.from(node.querySelectorAll('text'));
    if (texts.length === 0) return undefined;
    const lines: string[] = [];
    let sumX = 0;
    let sumY = 0;
    let positioned = 0;
    for (const text of texts) {
        const value = text.textContent ?? '';
        if (value.trim()) lines.push(value);
        const x = Number.parseFloat(text.getAttribute('x') ?? '');
        const y = Number.parseFloat(text.getAttribute('y') ?? '');
        if (Number.isFinite(x) && Number.isFinite(y)) {
            sumX += x;
            sumY += y;
            positioned += 1;
        }
    }
    if (lines.length === 0) return undefined;
    return {
        lines,
        centerX: positioned > 0 ? sumX / positioned : 0,
        centerY: positioned > 0 ? sumY / positioned : 0,
    };
};

/**
 * Scratchblocks paints anything it does not recognise in the "obsolete" red, so a graph whose labels are not block
 * source would come out as a wall of red boxes — worse than the plain labels it replaced. Only labels the renderer
 * actually understands are drawn as blocks.
 */
const isRecognised = (documentModel: unknown): boolean => {
    let recognised = true;
    const visit = (value: unknown, depth: number): void => {
        if (!recognised || depth > 50 || !value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        const info = node.info as { category?: unknown } | undefined;
        if (info && typeof info === 'object' && info.category === 'obsolete') {
            recognised = false;
            return;
        }
        for (const key of ['scripts', 'blocks', 'children', 'args']) {
            const branch = node[key];
            if (Array.isArray(branch)) branch.forEach((child) => visit(child, depth + 1));
        }
    };
    visit(documentModel, 0);
    return recognised;
};

/**
 * Redraw the labels of a Graphviz program graph as Scratch blocks, the way the LitterBox HTML report does: where the
 * node text is Scratchblocks source, a learner recognises the graph as their own program rather than as source code.
 * Nodes the renderer cannot parse, or does not recognise, keep their plain label.
 *
 * @returns the number of nodes that were given a rendered block.
 */
export async function renderGraphNodeBlocks(svg: SVGSVGElement, locale: string): Promise<number> {
    const documentObject = svg.ownerDocument;
    const nodes = Array.from(svg.querySelectorAll('g.node'));
    if (nodes.length === 0) return 0;

    const renderer = await prepareScratchblocks(documentObject);
    const languages = scratchblocksLanguages(locale);
    const NodeConstructor = documentObject.defaultView?.Node;
    let rendered = 0;

    for (const node of nodes) {
        const text = readNodeText(node);
        if (!text) continue;
        const source = text.lines.join('\n').trim();
        if (!source || STRUCTURAL_LABELS.has(source.toLowerCase())) continue;

        let block: unknown;
        try {
            const parsed = renderer.parse(source, { languages });
            if (!isRecognised(parsed)) continue;
            block = renderer.render(parsed, { languages, scale: 0.6, style: 'scratch3' });
        } catch {
            continue;
        }
        if (!NodeConstructor || !(block instanceof NodeConstructor) || !(block instanceof Element))
            continue;
        if (block.namespaceURI !== SVG_NAMESPACE) continue;

        normalizeScratchblocksTransforms(block);
        const width = Number.parseFloat(block.getAttribute('width') ?? '');
        const height = Number.parseFloat(block.getAttribute('height') ?? '');
        if (Number.isFinite(width) && Number.isFinite(height)) {
            block.setAttribute('x', String(text.centerX - width / 2));
            block.setAttribute('y', String(text.centerY - height / 2));
        }
        node.appendChild(block);
        // The block covers the label; `visibility` is an SVG attribute, so it survives the style-attribute policy.
        for (const original of node.querySelectorAll('text')) {
            if (!block.contains(original)) original.setAttribute('visibility', 'hidden');
        }
        rendered += 1;
    }

    return rendered;
}
