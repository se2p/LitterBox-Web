// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { AskAiQuestions } from '../src/api/ask-ai';
import {
    findingLinkParams,
    findingLinkTo,
    scopeForLink,
} from '../src/components/ask-ai/finding-link';

/** Finding selectors are opaque digests; the analysis page cannot generate them. */
const CAT = 'target:v1-c0ffee00';
const CAT_SCRIPT = 'target:v1-c0ffee01';
const DOG = 'target:v1-d0d0face';
const DOG_SCRIPT = 'target:v1-d0d0fac1';

const questions = (findings: AskAiQuestions['findings']): AskAiQuestions => ({
    schemaVersion: 1,
    inquiries: [
        {
            selector: 'inquiry:v1-abc',
            kind: 'loop',
            label: 'How often does this repeat?',
            target: CAT_SCRIPT,
        },
    ],
    findings,
    truncated: false,
    previewsTruncated: false,
    targets: [
        {
            key: CAT,
            kind: 'sprite',
            label: 'Cat',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: [],
        },
        {
            key: CAT_SCRIPT,
            kind: 'script',
            label: 'when green flag clicked',
            parent: CAT,
            scratchblocks: 'when gf clicked',
            thumbnail: null,
            intents: [],
        },
        {
            key: DOG,
            kind: 'sprite',
            label: 'Dog',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: [],
        },
        {
            key: DOG_SCRIPT,
            kind: 'script',
            label: 'when green flag clicked',
            parent: DOG,
            scratchblocks: 'when gf clicked',
            thumbnail: null,
            intents: [],
        },
    ],
});

const finding = (
    selector: string,
    finder: string,
    target: string,
    label: string,
): AskAiQuestions['findings'][number] => ({
    selector,
    label,
    family: 'bug',
    target,
    finder,
    scratchblocks: '',
});

describe('the link from a finding on the analysis result to its conversation', () => {
    it('carries the finder, which is the one name both listings call a finding by', () => {
        const link = findingLinkTo('a token/with slash', {
            finderId: 'EmptyLoopFinder',
            sprite: 'Cat',
            hint: 'This loop is empty.',
        });

        expect(link.startsWith('/ask-ai/submissions/a%20token%2Fwith%20slash?')).toBe(true);
        const params = findingLinkParams(link.slice(link.indexOf('?')));
        expect(params).toEqual({
            finder: 'EmptyLoopFinder',
            sprite: 'Cat',
            finding: 'This loop is empty.',
        });
    });

    it('leaves out what the analysis result could not say, rather than sending empty parameters', () => {
        expect(findingLinkTo('t', {})).toBe('/ask-ai/submissions/t');
    });

    it('finds the finding by its finder, whose name the opaque selector does not contain', () => {
        const only = finding('finding:v1-9a8b7c6d', 'EmptyLoopFinder', CAT_SCRIPT, 'Empty loop');
        const scope = scopeForLink(
            questions([only, finding('finding:v1-1122', 'LongScript', DOG_SCRIPT, 'Long script')]),
            { finder: 'EmptyLoopFinder' },
            'en',
        );

        expect(scope).toEqual({ kind: 'finding', selector: only.selector, label: only.label });
    });

    it('tells two findings of one finder apart by the sprite the reader pressed in', () => {
        const inDog = finding('finding:v1-dddd', 'EmptyLoopFinder', DOG_SCRIPT, 'Empty loop');
        const scope = scopeForLink(
            questions([
                finding('finding:v1-cccc', 'EmptyLoopFinder', CAT_SCRIPT, 'Empty loop'),
                inDog,
            ]),
            { finder: 'EmptyLoopFinder', sprite: 'Dog' },
            'en',
        );

        expect(scope).toEqual({ kind: 'finding', selector: inDog.selector, label: inDog.label });
    });

    it('opens the chooser rather than guessing, where one sprite has the same finding twice', () => {
        const scope = scopeForLink(
            questions([
                finding('finding:v1-aaaa', 'EmptyLoopFinder', CAT_SCRIPT, 'One empty loop'),
                finding('finding:v1-bbbb', 'EmptyLoopFinder', CAT_SCRIPT, 'Another empty loop'),
            ]),
            { finder: 'EmptyLoopFinder', sprite: 'Cat' },
            'en',
        );

        expect(scope).toBeUndefined();
    });

    it('still narrows by the words where the sprite alone left two of them', () => {
        const wanted = finding(
            'finding:v1-bbbb',
            'EmptyLoopFinder',
            CAT_SCRIPT,
            'Another empty loop',
        );
        const scope = scopeForLink(
            questions([
                finding('finding:v1-aaaa', 'EmptyLoopFinder', CAT_SCRIPT, 'One empty loop'),
                wanted,
            ]),
            { finder: 'EmptyLoopFinder', sprite: 'Cat', finding: 'Another empty loop' },
            'en',
        );

        expect(scope).toEqual({ kind: 'finding', selector: wanted.selector, label: wanted.label });
    });

    it('opens the chooser where the named occurrence is missing and only a sibling of its finder remains', () => {
        const project = questions([
            finding('finding:v1-cccc', 'EmptyLoopFinder', CAT_SCRIPT, 'Cat empty loop'),
        ]);

        expect(
            scopeForLink(
                project,
                { finder: 'EmptyLoopFinder', sprite: 'Dog', finding: 'Dog empty loop' },
                'en',
            ),
        ).toBeUndefined();
        expect(
            scopeForLink(project, { finder: 'EmptyLoopFinder', sprite: 'Dog' }, 'en'),
        ).toBeUndefined();
        expect(
            scopeForLink(
                project,
                { finder: 'EmptyLoopFinder', sprite: 'Cat', finding: 'Some other words' },
                'en',
            ),
        ).toBeUndefined();
    });

    it('resolves a sole finder match that agrees with every discriminator the link carries', () => {
        const only = finding('finding:v1-cccc', 'EmptyLoopFinder', CAT_SCRIPT, 'Cat empty loop');
        const scope = scopeForLink(
            questions([only]),
            { finder: 'EmptyLoopFinder', sprite: 'Cat', finding: 'Cat empty loop' },
            'en',
        );

        expect(scope).toEqual({ kind: 'finding', selector: only.selector, label: only.label });
    });

    it('falls back to the words for a finding this listing reports under no finder the link knows', () => {
        const only = finding('finding:v1-eeee', 'SomeOtherFinder', CAT_SCRIPT, 'A loop is empty');
        const scope = scopeForLink(questions([only]), { finding: 'A loop is empty' }, 'en');

        expect(scope).toEqual({ kind: 'finding', selector: only.selector, label: only.label });
    });

    it('opens the chooser rather than guessing, where an unknown finder leaves the words on two sprites', () => {
        const project = questions([
            finding('finding:v1-cccc', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty'),
            finding('finding:v1-dddd', 'RenamedFinder', DOG_SCRIPT, 'A loop is empty'),
        ]);

        expect(
            scopeForLink(project, { finder: 'OldFinder', finding: 'A loop is empty' }, 'en'),
        ).toBeUndefined();
    });

    it('lets the sprite pick the one occurrence of the words when the finder is unknown', () => {
        const inDog = finding('finding:v1-dddd', 'RenamedFinder', DOG_SCRIPT, 'A loop is empty');
        const project = questions([
            finding('finding:v1-cccc', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty'),
            inDog,
        ]);

        expect(
            scopeForLink(
                project,
                { finder: 'OldFinder', sprite: 'Dog', finding: 'A loop is empty' },
                'en',
            ),
        ).toEqual({ kind: 'finding', selector: inDog.selector, label: inDog.label });
    });

    it('offers nothing where an unknown finder and the sprite match none of the words', () => {
        const project = questions([
            finding('finding:v1-cccc', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty'),
            finding('finding:v1-dddd', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty'),
        ]);

        expect(
            scopeForLink(
                project,
                { finder: 'OldFinder', sprite: 'Dog', finding: 'A loop is empty' },
                'en',
            ),
        ).toBeUndefined();
        expect(
            scopeForLink(
                questions([
                    finding('finding:v1-eeee', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty'),
                ]),
                { finder: 'OldFinder', sprite: 'Dog', finding: 'A loop is empty' },
                'en',
            ),
        ).toBeUndefined();
    });

    it('still resolves a unique label match under an unknown finder', () => {
        const only = finding('finding:v1-eeee', 'RenamedFinder', CAT_SCRIPT, 'A loop is empty');
        const scope = scopeForLink(
            questions([only]),
            { finder: 'OldFinder', finding: 'A loop is empty' },
            'en',
        );

        expect(scope).toEqual({ kind: 'finding', selector: only.selector, label: only.label });
    });

    it('offers nothing where the project does not hold what the link named', () => {
        const project = questions([
            finding('finding:v1-aaaa', 'EmptyLoopFinder', CAT_SCRIPT, 'Empty loop'),
        ]);

        expect(scopeForLink(project, { finder: 'NeverRun' }, 'en')).toBeUndefined();
        expect(scopeForLink(project, {}, 'en')).toBeUndefined();
    });
});
