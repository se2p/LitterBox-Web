// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { AskAiQuestions, AskAiTarget } from '../src/api/ask-ai';
import { buildProjectTree } from '../src/components/ask-ai/project-targets';

const target = (value: Partial<AskAiTarget> & Pick<AskAiTarget, 'key' | 'kind'>): AskAiTarget => ({
    label: '',
    parent: '',
    scratchblocks: '',
    thumbnail: null,
    intents: [],
    ...value,
});

const questions = (value: Partial<AskAiQuestions>): AskAiQuestions => ({
    schemaVersion: 1,
    inquiries: [],
    findings: [],
    targets: [],
    truncated: false,
    previewsTruncated: false,
    ...value,
});

const inquiry = (selector: string, targetKey: string) => ({
    selector,
    kind: 'event',
    label: selector,
    target: targetKey,
});

const finding = (selector: string, targetKey: string) => ({
    selector,
    label: selector,
    family: 'bug' as const,
    target: targetKey,
    finder: 'AFinder',
    scratchblocks: '',
});

describe('the project a reader walks through', () => {
    const base = questions({
        targets: [
            target({ key: 'p', kind: 'program' }),
            target({ key: 'cat', kind: 'sprite', label: 'Cat' }),
            target({ key: 'stage', kind: 'stage', label: 'Stage' }),
            target({ key: 'cat-1', kind: 'script', parent: 'cat' }),
            target({ key: 'cat-2', kind: 'procedure', parent: 'cat' }),
        ],
        inquiries: [
            inquiry('inquiry:v1-whole', 'p'),
            inquiry('inquiry:v1-cat', 'cat'),
            inquiry('inquiry:v1-cat-1', 'cat-1'),
            inquiry('inquiry:v1-cat-2', 'cat-2'),
        ],
        findings: [finding('finding:v1-a', 'cat-1')],
    });

    it('hangs each question and finding on the place it names', () => {
        const tree = buildProjectTree(base);
        expect(tree.program?.inquiries.map((entry) => entry.selector)).toEqual([
            'inquiry:v1-whole',
        ]);
        expect(tree.byKey.get('cat-1')?.inquiries.map((entry) => entry.selector)).toEqual([
            'inquiry:v1-cat-1',
        ]);
        expect(tree.byKey.get('cat-1')?.findings.map((entry) => entry.selector)).toEqual([
            'finding:v1-a',
        ]);
    });

    it('hangs a sprite’s scripts under it, in the order the service listed them', () => {
        const tree = buildProjectTree(base);
        expect(tree.byKey.get('cat')?.scripts.map((script) => script.target.key)).toEqual([
            'cat-1',
            'cat-2',
        ]);
        expect(tree.actors.map((actor) => actor.target.key)).toEqual(['cat', 'stage']);
    });

    it('keeps a question whose place this project does not list, rather than dropping it', () => {
        const tree = buildProjectTree(
            questions({
                targets: [target({ key: 'p', kind: 'program' })],
                inquiries: [inquiry('inquiry:v1-orphan', 'target:v1-gone')],
            }),
        );
        expect(tree.program?.inquiries.map((entry) => entry.selector)).toEqual([
            'inquiry:v1-orphan',
        ]);
    });

    it('survives a listing with no places at all', () => {
        const tree = buildProjectTree(questions({ inquiries: [inquiry('inquiry:v1-a', '')] }));
        expect(tree.program).toBeUndefined();
        expect(tree.actors).toEqual([]);
    });
});
