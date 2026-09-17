// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { describe, expect, it } from 'vitest';
import type { AskAiQuestions, AskAiTarget } from '../src/api/ask-ai';
import {
    buildCatalogue,
    goalsOffered,
    placesFor,
    questionsFor,
    unsureShortlist,
} from '../src/components/ask-ai/goal-catalogue';
import { buildProjectTree } from '../src/components/ask-ai/project-targets';
import { inquiryTheme } from '../src/components/ask-ai/inquiry-theme';

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

const naming = {
    general: (key: string, sprite: string) => `${key}(${sprite})`,
    stageName: 'Stage',
};

const catalogueOf = (value: AskAiQuestions) =>
    buildCatalogue(buildProjectTree(value), value, {
        general: (key, sprite) => naming.general(key, sprite),
        stageName: naming.stageName,
    });

const project = questions({
    targets: [
        target({
            key: 'p',
            kind: 'program',
            intents: ['SUMMARISE', 'EXPLAIN', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
        }),
        target({ key: 'cat', kind: 'sprite', label: 'Cat', intents: ['SUMMARISE', 'EXPLAIN'] }),
        target({
            key: 'cat-1',
            kind: 'script',
            parent: 'cat',
            label: 'when green flag clicked',
            intents: ['EXPLAIN'],
        }),
        target({ key: 'bird', kind: 'sprite', label: 'Bird', intents: ['SUMMARISE'] }),
    ],
    inquiries: [
        { selector: 'i:loop', kind: 'loop', label: 'Does this loop stop?', target: 'cat-1' },
        { selector: 'i:timing', kind: 'timing', label: 'How long?', target: 'cat-1' },
        { selector: 'i:motion', kind: 'motion', label: 'How does it move?', target: 'cat' },
        {
            selector: 'i:message',
            kind: 'message-flow',
            label: 'Which scripts does this reach?',
            target: 'cat-1',
        },
        { selector: 'i:strange', kind: 'not-a-kind', label: 'Something new?', target: 'p' },
    ],
    findings: [
        {
            selector: 'f:bug',
            label: 'A bug',
            family: 'bug',
            target: 'cat-1',
            finder: 'ABug',
            scratchblocks: '',
        },
        {
            selector: 'f:perfume',
            label: 'A pattern',
            family: 'perfume',
            target: 'p',
            finder: 'APattern',
            scratchblocks: '',
        },
    ],
});

describe('the catalogue behind the goals', () => {
    const catalogue = catalogueOf(project);

    it('sorts every question the service sent under one of the reader’s own goals', () => {
        expect(
            questionsFor(catalogue, 'understand', 'cat').map((question) => question.scope.selector),
        ).toEqual([
            'common:SUMMARISE@cat',
            'common:EXPLAIN@cat',
            'i:motion',
            'i:loop',
            'i:timing',
            'i:message',
        ]);
        expect(
            questionsFor(catalogue, 'problems', 'cat').map((question) => question.scope.selector),
        ).toEqual(['f:bug']);
        expect(questionsFor(catalogue, 'improve', null).map((q) => q.scope.selector)).toEqual([
            'common:PROVIDE_FEEDBACK',
            'f:perfume',
        ]);
        expect(questionsFor(catalogue, 'understand', null).map((q) => q.scope.selector)).toContain(
            'i:strange',
        );
    });

    it('sorts an inquiry that is an idea under the wish it answers, not under explaining', () => {
        const withIdeas = catalogueOf(
            questions({
                ...project,
                inquiries: [
                    ...project.inquiries,
                    { selector: 'i:score', kind: 'score-idea', label: 'Keep score?', target: 'p' },
                    {
                        selector: 'i:smooth',
                        kind: 'smooth-motion',
                        label: 'Smoother?',
                        target: 'cat',
                    },
                ],
            }),
        );
        expect(questionsFor(withIdeas, 'add', null).map((q) => q.scope.selector)).toContain(
            'i:score',
        );
        expect(questionsFor(withIdeas, 'improve', 'cat').map((q) => q.scope.selector)).toContain(
            'i:smooth',
        );
        expect(questionsFor(withIdeas, 'understand').map((q) => q.scope.selector)).not.toContain(
            'i:score',
        );
        const themeOf = (selector: string) =>
            withIdeas.questions.find((q) => q.scope.selector === selector)?.theme;
        expect(themeOf('i:score')).toBe('ideas');
        expect(themeOf('i:smooth')).toBe('polishing');
        expect(themeOf('i:motion')).toBe('moving');
    });

    it('offers a place whose only questions are the general ones', () => {
        expect(placesFor(catalogue, 'understand').map((place) => place.key)).toEqual([
            null,
            'cat',
            'bird',
        ]);
        expect(placesFor(catalogue, 'problems').map((place) => place.key)).toEqual(['cat']);
    });

    it('offers a sprite whose code is one script as one place, and keeps that script’s blocks', () => {
        const cat = placesFor(catalogue, 'understand').find((place) => place.key === 'cat');
        expect(cat?.code?.target.key).toBe('cat-1');
        expect(placesFor(catalogue, 'understand').some((place) => place.kind === 'script')).toBe(
            false,
        );
    });

    it('numbers a script by where it sits among all its sprite’s scripts, not among the offered ones', () => {
        const twoScripts = questions({
            ...project,
            targets: [
                ...project.targets,
                target({ key: 'cat-2', kind: 'script', parent: 'cat', intents: ['EXPLAIN'] }),
            ],
        });
        const places = catalogueOf(twoScripts).places;
        expect(places.map((place) => [place.key, place.number])).toContainEqual(['cat-1', 1]);
        expect(places.map((place) => [place.key, place.number])).toContainEqual(['cat-2', 2]);
    });

    it('names each question in this frontend’s words, and carries the whole finding into the conversation', () => {
        const summarise = questionsFor(catalogue, 'understand', 'cat')[0];
        expect(summarise.scope).toEqual({
            kind: 'common',
            selector: 'common:SUMMARISE@cat',
            label: 'askAiSpriteSummarise(Cat)',
        });
        expect(questionsFor(catalogue, 'improve', null)[1].scope.label).toBe('A pattern');
    });

    it('carries a generated question’s own kind into its scope, for the follow-ups that read it back', () => {
        // Follow-up policy needs the inquiry kind; selectors are opaque.
        const loopQuestion = catalogue.questions.find(
            (question) => question.scope.selector === 'i:loop',
        );
        expect(loopQuestion?.scope.kind).toBe('inquiry');
        expect(
            loopQuestion?.scope.kind === 'inquiry' ? loopQuestion.scope.inquiryKind : undefined,
        ).toBe('loop');
    });

    it('carries whether the service had more to send, so the reader can be told this is a selection', () => {
        const full = catalogueOf(project);
        expect(full.truncated).toBe(false);
        const cut = catalogueOf(questions({ ...project, truncated: true }));
        expect(cut.truncated).toBe(true);
    });

    it('samples this project rather than reciting the four questions every project can be asked', () => {
        const picked = unsureShortlist(catalogue);
        expect(picked.map((question) => question.scope.selector)).toEqual([
            'i:motion',
            'f:bug',
            'i:message',
            'f:perfume',
            'common:SUGGEST_EXTENSION',
        ]);
        expect(picked.filter((question) => question.place !== null).length).toBeGreaterThan(2);
        expect(placesFor(catalogue, 'unsure').map((place) => place.key)).toEqual([null]);
    });

    it('falls back to what a project offers when it has nothing of its own for a slot', () => {
        const bare = questions({
            targets: [
                target({
                    key: 'p',
                    kind: 'program',
                    intents: ['SUMMARISE', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
                }),
            ],
        });
        expect(unsureShortlist(catalogueOf(bare)).map((q) => q.scope.selector)).toEqual([
            'common:PROVIDE_FEEDBACK',
            'common:SUGGEST_EXTENSION',
            'common:SUMMARISE',
        ]);
    });

    it('leaves out a goal this project has nothing to answer under', () => {
        const bare = questions({
            targets: [target({ key: 'p', kind: 'program', intents: ['SUMMARISE'] })],
        });
        const only = catalogueOf(bare);
        expect(goalsOffered(only)).toEqual(['understand', 'problems', 'unsure']);
        expect(questionsFor(only, 'problems')).toEqual([]);
        expect(questionsFor(only, 'improve')).toEqual([]);
    });

    it('says nothing about problems until there is a project to say it about', () => {
        const empty = catalogueOf(questions({}));
        expect(goalsOffered(empty)).toEqual([]);
        expect(placesFor(empty, 'understand')).toEqual([]);
    });

    it('does not offer a script what could be added to it, even where the service still lists that intent', () => {
        const withScripts = catalogueOf(
            questions({
                targets: [
                    target({ key: 'p', kind: 'program' }),
                    target({ key: 'cat', kind: 'sprite', label: 'Cat' }),
                    target({
                        key: 'cat-1',
                        kind: 'script',
                        parent: 'cat',
                        label: 'when green flag clicked',
                        intents: ['EXPLAIN', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
                    }),
                    target({
                        key: 'cat-2',
                        kind: 'script',
                        parent: 'cat',
                        label: 'when I receive [go]',
                    }),
                ],
            }),
        );
        const offered = withScripts.questions
            .filter((question) => question.place === 'cat-1' && question.source === 'general')
            .map((question) => question.text);
        expect(offered).toEqual(['askAiScriptExplain(Cat)', 'askAiScriptProvideFeedback(Cat)']);
    });
});

describe('the picture drawn beside a generated question', () => {
    it('gives sound a mark of its own rather than borrowing the speech bubble', () => {
        expect(inquiryTheme('sound')).toBe('sound');
    });

    it('draws what ends the project beside what starts it', () => {
        expect(inquiryTheme('stopping')).toBe('starting');
    });

    it('draws the stage changing its backdrop with the other questions about how the project looks', () => {
        expect(inquiryTheme('backdrop-looks')).toBe('moving');
    });

    it('draws what a script does differently from one run to the next as a fact about that script', () => {
        expect(inquiryTheme('randomness')).toBe('scripts');
    });

    it('falls through to the mark for an unknown kind now that the service no longer sends this one', () => {
        // Ignore inquiry kinds retired from the service vocabulary.
        expect(inquiryTheme('script-purpose')).toBe('other');
    });
});
