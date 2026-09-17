// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import {
    parseRichHint,
    richHintLead,
    richHintTerms,
    scratchblocksSourceForInline,
    type RichHintNode,
} from '../src/components/single-project/rich-hint';
import { normalizeScratchblocksSource } from '../src/components/single-project/scratchblocks-source';

const inlineKinds = (nodes: RichHintNode[]): string[] =>
    nodes.flatMap((node) => {
        if (node.kind === 'inline') return [node.inlineKind];
        if (node.kind === 'format') return inlineKinds(node.children);
        return [];
    });

const textValue = (nodes: RichHintNode[]): string =>
    nodes
        .map((node) => {
            if (node.kind === 'text') return node.value;
            if (node.kind === 'lineBreak') return '\n';
            if (node.kind === 'format') return textValue(node.children);
            return '';
        })
        .join('');

describe('rich hint parser', () => {
    it('supports every legacy compatibility marker', () => {
        const nodes = parseRichHint(
            '[b]bold[/b] [i]italic[/i] [u]underlined[/u] [s]removed[/s] [bc]code[/bc] [c=#f09438]orange[/c] [newLine] [sbi]move (10) steps[/sbi] [var]score[/var] [var][/var] [list]items[/list] [sbVariables] [TRUE] [FALSE] [LEQ] [EQ] [GEQ] [IF] [ELSE]',
        );

        expect(nodes.filter((node) => node.kind === 'format')).toHaveLength(6);
        expect(nodes.some((node) => node.kind === 'lineBreak')).toBe(true);
        expect(nodes.some((node) => node.kind === 'variablesBadge')).toBe(true);
        expect(nodes.filter((node) => node.kind === 'term')).toHaveLength(2);
        expect(inlineKinds(nodes)).toEqual([
            'scratchblocks',
            'variable',
            'variable',
            'list',
            'less-or-equal',
            'equal',
            'greater-or-equal',
            'if',
            'else',
        ]);
    });

    it('supports nested formatting, adjacent fragments, and Unicode text', () => {
        const nodes = parseRichHint(
            'Ä [b]fett [i]und kursiv[/i][/b][sbi]wenn ⚙️ geklickt[/sbi][sbi]sage [Hallo][/sbi]',
        );

        expect(textValue(nodes)).toContain('Ä fett und kursiv');
        expect(inlineKinds(nodes)).toEqual(['scratchblocks', 'scratchblocks']);
        const strong = nodes.find((node) => node.kind === 'format');
        expect(strong?.kind === 'format' && inlineKinds(strong.children)).toEqual([]);
        expect(
            strong?.kind === 'format' &&
                strong.children.some((node) => node.kind === 'format' && node.format === 'italic'),
        ).toBe(true);
    });

    it('draws whole scripts for the block-level marker question choices use', () => {
        // Verbatim from a generated multiple-choice answer: this used to reach the reader as literal markup.
        const nodes = parseRichHint(
            '[scratchblocks]say [Lecker!] for (2) seconds\nstop [all v][/scratchblocks]',
        );

        expect(nodes).toEqual([
            { kind: 'script', source: 'say [Lecker!] for (2) seconds\nstop [all v]' },
        ]);
        // The inline marker keeps its own meaning; only the block-level one is new.
        expect(inlineKinds(parseRichHint('[sbi]move (10) steps[/sbi]'))).toEqual(['scratchblocks']);
        expect(textValue(parseRichHint('[scratchblocks]unclosed'))).toBe('[scratchblocks]unclosed');
    });

    it('keeps unknown, unclosed, mismatched, and unsafe markers visible', () => {
        const value =
            '[unknown] [b]unclosed [i]nested <img src=x onerror=alert(1)> [c=url(https://bad)]unsafe[/c]';
        const nodes = parseRichHint(`${value}[/s]`);

        expect(textValue(nodes)).toBe(`${value}[/s]`);
        expect(nodes.some((node) => node.kind === 'format' && node.format === 'color')).toBe(false);
        expect(textValue(parseRichHint('[b]mismatched[/i]'))).toBe('[b]mismatched[/i]');
    });

    it('localizes legacy terms and preserves safe Scratchblocks source', () => {
        expect(richHintTerms('de')).toEqual({
            variables: 'Variablen',
            trueValue: 'WAHR',
            falseValue: 'FALSCH',
            if: 'falls',
            else: 'sonst',
        });
        expect(richHintTerms('es').falseValue).toBe('FALSO');
        expect(richHintTerms('nl').if).toBe('als');

        const nodes = parseRichHint('[var]größe[/var] [IF] [LEQ]');
        const inline = nodes.filter(
            (node): node is Extract<RichHintNode, { kind: 'inline' }> => node.kind === 'inline',
        );
        expect(scratchblocksSourceForInline(inline[0]!, 'de')).toBe('(größe)');
        expect(scratchblocksSourceForInline(inline[1]!, 'de')).toBe('falls :: #ffab19');
        expect(scratchblocksSourceForInline(inline[2]!, 'de')).toBe('<() < ()>');
    });
});

describe('Scratchblocks source normalization', () => {
    it.each([
        ['[scratchblocks]\nmove (10) steps\n[/scratchblocks]', 'move (10) steps'],
        ['[scratchblocks]move (10) steps[/scratchblocks]', 'move (10) steps'],
        [
            '[scratchblocks]when green flag clicked[/scratchblocks]\n[scratchblocks]say "ä"[/scratchblocks]',
            'when green flag clicked\nsay "ä"',
        ],
        [
            "  when green flag clicked\r\n// keep 'quotes' and :: #ffab19  ",
            "when green flag clicked\n// keep 'quotes' and :: #ffab19",
        ],
        ['[scratchblocks]   [/scratchblocks]', ''],
        ['   \r\n  ', ''],
        [null, ''],
        [undefined, ''],
    ])('normalizes %j', (source, expected) => {
        expect(normalizeScratchblocksSource(source)).toBe(expected);
    });
});

describe('the lead paragraph of a hint', () => {
    it('cuts a LitterBox hint at the blank line before its suggestion', () => {
        const hint =
            '[b]Problem:[/b] [newLine] The message is never sent. [newLine] [newLine] ' +
            '[b]Suggestion for code improvement:[/b] [newLine] Use a [sbi]broadcast (go v)[/sbi] block.';

        expect(richHintLead(hint)).toBe('[b]Problem:[/b] [newLine] The message is never sent.');
    });

    it('cuts between paragraphs, so what it returns is still balanced markup', () => {
        const hint = '[b]Problem:[/b] [newLine] A loop never ends. [newLine] [newLine] [b]Fix:[/b]';
        const nodes = parseRichHint(richHintLead(hint));

        expect(nodes.filter((node) => node.kind === 'format')).toHaveLength(1);
        expect(JSON.stringify(nodes)).not.toContain('Fix');
    });

    it.each([
        ['A pattern that could be tidied.', 'A pattern that could be tidied.'],
        [
            'One paragraph [newLine] with a single break.',
            'One paragraph [newLine] with a single break.',
        ],
        ['', ''],
        [null, ''],
        [undefined, ''],
    ])('leaves %j whole when it has no blank line', (hint, expected) => {
        expect(richHintLead(hint)).toBe(expected);
    });
});
