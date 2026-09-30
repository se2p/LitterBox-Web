// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

export type RichHintFormat = 'strong' | 'italic' | 'underline' | 'strike' | 'code' | 'color';

export type RichHintInlineKind =
    | 'scratchblocks'
    | 'variable'
    | 'list'
    | 'less-or-equal'
    | 'equal'
    | 'greater-or-equal'
    | 'if'
    | 'else';

export type RichHintNode =
    | { kind: 'text'; value: string }
    | { kind: 'lineBreak' }
    | { kind: 'format'; format: RichHintFormat; children: RichHintNode[]; color?: string }
    | { kind: 'inline'; inlineKind: RichHintInlineKind; source?: string }
    | { kind: 'script'; source: string }
    | { kind: 'variablesBadge' }
    | { kind: 'term'; term: 'true' | 'false' };

export const richHintFormatTag: Record<
    RichHintFormat,
    'strong' | 'em' | 'u' | 's' | 'code' | 'span'
> = {
    strong: 'strong',
    italic: 'em',
    underline: 'u',
    strike: 's',
    code: 'code',
    color: 'span',
};

const pairedTags = {
    b: 'strong',
    i: 'italic',
    u: 'underline',
    s: 'strike',
    bc: 'code',
} as const satisfies Record<string, Exclude<RichHintFormat, 'color'>>;

const colorNames = new Set([
    'black',
    'blue',
    'cyan',
    'gray',
    'green',
    'grey',
    'orange',
    'pink',
    'purple',
    'red',
    'white',
    'yellow',
]);

const colorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isSafeColor = (value: string): boolean =>
    colorNames.has(value.toLowerCase()) || colorPattern.test(value);

const appendText = (nodes: RichHintNode[], value: string): void => {
    if (!value) return;
    const previous = nodes[nodes.length - 1];
    if (previous?.kind === 'text') previous.value += value;
    else nodes.push({ kind: 'text', value });
};

const findClosing = (
    input: string,
    contentStart: number,
    openingMarker: string,
    closingMarker: string,
): number => {
    let depth = 1;
    let cursor = contentStart;
    while (cursor < input.length) {
        const nextClosing = input.indexOf(closingMarker, cursor);
        const nextOpening = input.indexOf(openingMarker, cursor);
        if (nextClosing < 0) return -1;
        if (nextOpening >= 0 && nextOpening < nextClosing) {
            depth += 1;
            cursor = nextOpening + openingMarker.length;
            continue;
        }
        depth -= 1;
        if (depth === 0) return nextClosing;
        cursor = nextClosing + closingMarker.length;
    }
    return -1;
};

const lineBreakLength = (input: string, cursor: number): number =>
    input[cursor] === '\r' && input[cursor + 1] === '\n' ? 2 : 1;

const nextStop = (input: string, from: number, end: number): number => {
    for (let cursor = from; cursor < end; cursor += 1) {
        const char = input[cursor];
        if (char === '[' || char === '\n' || char === '\r') return cursor;
    }
    return end;
};

const inlineNode = (inlineKind: RichHintInlineKind, source?: string): RichHintNode => ({
    kind: 'inline',
    inlineKind,
    ...(source === undefined ? {} : { source }),
});

const parseRange = (input: string, start: number, end: number): RichHintNode[] => {
    const nodes: RichHintNode[] = [];
    let cursor = start;

    while (cursor < end) {
        const char = input[cursor];

        if (char === '\n' || char === '\r') {
            nodes.push({ kind: 'lineBreak' });
            cursor += lineBreakLength(input, cursor);
            continue;
        }

        if (char !== '[') {
            const textEnd = nextStop(input, cursor, end);
            appendText(nodes, input.slice(cursor, textEnd));
            cursor = textEnd;
            continue;
        }

        const remaining = input.slice(cursor, end);
        if (remaining.startsWith('[newLine]')) {
            nodes.push({ kind: 'lineBreak' });
            cursor += '[newLine]'.length;
            continue;
        }
        if (remaining.startsWith('[sbVariables]')) {
            nodes.push({ kind: 'variablesBadge' });
            cursor += '[sbVariables]'.length;
            continue;
        }
        if (remaining.startsWith('[TRUE]')) {
            nodes.push({ kind: 'term', term: 'true' });
            cursor += '[TRUE]'.length;
            continue;
        }
        if (remaining.startsWith('[FALSE]')) {
            nodes.push({ kind: 'term', term: 'false' });
            cursor += '[FALSE]'.length;
            continue;
        }

        const inlineMarkers: Array<[string, RichHintInlineKind]> = [
            ['[LEQ]', 'less-or-equal'],
            ['[EQ]', 'equal'],
            ['[GEQ]', 'greater-or-equal'],
        ];
        const inlineMarker = inlineMarkers.find(([marker]) => remaining.startsWith(marker));
        if (inlineMarker) {
            nodes.push(inlineNode(inlineMarker[1]));
            cursor += inlineMarker[0].length;
            continue;
        }
        if (remaining.startsWith('[IF]')) {
            nodes.push(inlineNode('if'));
            cursor += '[IF]'.length;
            continue;
        }
        if (remaining.startsWith('[ELSE]')) {
            nodes.push(inlineNode('else'));
            cursor += '[ELSE]'.length;
            continue;
        }

        const emptyVariable = '[var][/var]';
        if (remaining.startsWith(emptyVariable)) {
            nodes.push(inlineNode('variable', 'my variable'));
            cursor += emptyVariable.length;
            continue;
        }

        const variableMarker = '[var]';
        if (remaining.startsWith(variableMarker)) {
            const close = findClosing(
                input,
                cursor + variableMarker.length,
                variableMarker,
                '[/var]',
            );
            if (close >= 0 && close < end) {
                nodes.push(
                    inlineNode('variable', input.slice(cursor + variableMarker.length, close)),
                );
                cursor = close + '[/var]'.length;
                continue;
            }
            appendText(nodes, variableMarker);
            cursor += variableMarker.length;
            continue;
        }

        const listMarker = '[list]';
        if (remaining.startsWith(listMarker)) {
            const close = findClosing(input, cursor + listMarker.length, listMarker, '[/list]');
            if (close >= 0 && close < end) {
                nodes.push(inlineNode('list', input.slice(cursor + listMarker.length, close)));
                cursor = close + '[/list]'.length;
                continue;
            }
            appendText(nodes, listMarker);
            cursor += listMarker.length;
            continue;
        }

        const scriptMarker = '[scratchblocks]';
        if (remaining.startsWith(scriptMarker)) {
            const close = findClosing(
                input,
                cursor + scriptMarker.length,
                scriptMarker,
                '[/scratchblocks]',
            );
            if (close >= 0 && close < end) {
                nodes.push({
                    kind: 'script',
                    source: input.slice(cursor + scriptMarker.length, close).trim(),
                });
                cursor = close + '[/scratchblocks]'.length;
                continue;
            }
            appendText(nodes, scriptMarker);
            cursor += scriptMarker.length;
            continue;
        }

        const scratchblocksMarker = '[sbi]';
        if (remaining.startsWith(scratchblocksMarker)) {
            const close = findClosing(
                input,
                cursor + scratchblocksMarker.length,
                scratchblocksMarker,
                '[/sbi]',
            );
            if (close >= 0 && close < end) {
                nodes.push(
                    inlineNode(
                        'scratchblocks',
                        input.slice(cursor + scratchblocksMarker.length, close).trim(),
                    ),
                );
                cursor = close + '[/sbi]'.length;
                continue;
            }
            appendText(nodes, scratchblocksMarker);
            cursor += scratchblocksMarker.length;
            continue;
        }

        const colorMatch = remaining.match(/^\[c=([^\]]+)\]/);
        if (colorMatch) {
            const openingMarker = colorMatch[0];
            const color = colorMatch[1];
            const close = isSafeColor(color)
                ? findClosing(input, cursor + openingMarker.length, '[c=', '[/c]')
                : -1;
            if (close >= 0 && close < end) {
                nodes.push({
                    kind: 'format',
                    format: 'color',
                    color,
                    children: parseRange(input, cursor + openingMarker.length, close),
                });
                cursor = close + '[/c]'.length;
                continue;
            }
            appendText(nodes, openingMarker);
            cursor += openingMarker.length;
            continue;
        }

        const pairedMarker = Object.entries(pairedTags).find(([tag]) =>
            remaining.startsWith(`[${tag}]`),
        );
        if (pairedMarker) {
            const [tag, format] = pairedMarker;
            const openingMarker = `[${tag}]`;
            const closingMarker = `[/${tag}]`;
            const close = findClosing(
                input,
                cursor + openingMarker.length,
                openingMarker,
                closingMarker,
            );
            if (close >= 0 && close < end) {
                nodes.push({
                    kind: 'format',
                    format,
                    children: parseRange(input, cursor + openingMarker.length, close),
                });
                cursor = close + closingMarker.length;
                continue;
            }
            appendText(nodes, openingMarker);
            cursor += openingMarker.length;
            continue;
        }

        appendText(nodes, '[');
        cursor += 1;
    }

    return nodes;
};

export function parseRichHint(value: string | null | undefined): RichHintNode[] {
    if (typeof value !== 'string' || value.length === 0) return [];
    return parseRange(value, 0, value.length);
}

export interface RichHintTerms {
    variables: string;
    trueValue: string;
    falseValue: string;
    if: string;
    else: string;
}

export const richHintTerms = (locale: string): RichHintTerms => {
    switch (locale.toLowerCase().slice(0, 2)) {
        case 'de':
            return {
                variables: 'Variablen',
                trueValue: 'WAHR',
                falseValue: 'FALSCH',
                if: 'falls',
                else: 'sonst',
            };
        case 'es':
            return {
                variables: 'Variables',
                trueValue: 'VERDADERO',
                falseValue: 'FALSO',
                if: 'si',
                else: 'si no',
            };
        case 'nl':
            return {
                variables: 'Variabelen',
                trueValue: 'WAAR',
                falseValue: 'ONWAAR',
                if: 'als',
                else: 'anders',
            };
        default:
            return {
                variables: 'Variables',
                trueValue: 'TRUE',
                falseValue: 'FALSE',
                if: 'if',
                else: 'else',
            };
    }
};

/**
 * A hint up to its first blank line, for somewhere with room for one paragraph rather than all of them.
 *
 * A LitterBox hint states the pattern it matched, then leaves a blank line, then says what could be done about it.
 * The cut is at that blank line, which is between paragraphs and so never inside a tag pair: what comes back is
 * still markup this module can parse. A hint written as a single paragraph comes back whole.
 */
export const richHintLead = (value: string | null | undefined): string => {
    if (typeof value !== 'string') return '';
    const blankLine = value.search(/\[newLine\]\s*\[newLine\]/);
    return (blankLine < 0 ? value : value.slice(0, blankLine)).trim();
};

/** The readable text behind the markup, for search and for accessible names. */
export const richHintPlainText = (value: string | null | undefined, locale: string): string => {
    const terms = richHintTerms(locale);
    const flatten = (nodes: RichHintNode[]): string =>
        nodes
            .map((node) => {
                switch (node.kind) {
                    case 'text':
                        return node.value;
                    case 'lineBreak':
                        return '\n';
                    case 'format':
                        return flatten(node.children);
                    case 'variablesBadge':
                        return terms.variables;
                    case 'term':
                        return node.term === 'true' ? terms.trueValue : terms.falseValue;
                    case 'script':
                    case 'inline':
                        return node.source ?? '';
                }
            })
            .join('');
    return flatten(parseRichHint(value)).replace(/\s+/g, ' ').trim();
};

export const scratchblocksSourceForInline = (
    node: Extract<RichHintNode, { kind: 'inline' }>,
    locale: string,
): string => {
    const terms = richHintTerms(locale);
    switch (node.inlineKind) {
        case 'variable':
            return `(${node.source ?? 'my variable'})`;
        case 'list':
            return `(${node.source ?? ''}) :: list`;
        case 'less-or-equal':
            return '<() < ()>';
        case 'equal':
            return '<() = ()>';
        case 'greater-or-equal':
            return '<() > ()>';
        case 'if':
            return `${terms.if} :: #ffab19`;
        case 'else':
            return `${terms.else} :: #ffab19`;
        case 'scratchblocks':
            return node.source ?? '';
    }
};
