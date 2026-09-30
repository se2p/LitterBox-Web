// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import type { AskAiQuestions } from '../src/api/ask-ai';
import { useCatalogue } from '../src/components/ask-ai/goal-catalogue';
import { QuestionsChooser as Chooser } from '../src/components/ask-ai/QuestionsChooser';
import type { ChooserPosition } from '../src/components/ask-ai/trail';
import type { ConversationScope } from '../src/pages/ask-ai-machine';

function QuestionsChooser({
    questions,
    ...props
}: { questions: AskAiQuestions } & Omit<ComponentProps<typeof Chooser>, 'catalogue'>) {
    return <Chooser catalogue={useCatalogue(questions)} {...props} />;
}

const bugLabel =
    '[b]Problem:[/b] [newLine] A loop never ends. [newLine] [newLine] ' +
    '[b]Suggestion for code improvement:[/b] [newLine] Use a [sbi]repeat (10)[/sbi] block instead.';

const markedScript =
    'when green flag clicked\nforever :: #ff0000 // \u21e6  \ud83d\udc1b   \nmove (10) steps\nend';

const PROGRAM = 'target:v1-program';
const CAT = 'target:v1-cat';
const DOG = 'target:v1-dog';
const BIRD = 'target:v1-bird';
const CAT_FLAG = 'target:v1-cat-flag';
const CAT_MESSAGE = 'target:v1-cat-message';

const questions: AskAiQuestions = {
    schemaVersion: 1,
    truncated: false,
    previewsTruncated: false,
    inquiries: [
        ...Array.from({ length: 6 }, (_, index) => ({
            selector: `inquiry:v1-event-${index}`,
            kind: 'event',
            label: `[b]Question[/b] number ${index + 1}?`,
            target: PROGRAM,
        })),
        {
            selector: 'inquiry:v1-cat-purpose',
            kind: 'usage',
            label: 'What does this script of Cat do?',
            target: CAT_FLAG,
        },
        {
            selector: 'inquiry:v1-cat-timing',
            kind: 'timing',
            label: 'How long does this script take to run?',
            target: CAT_FLAG,
        },
        {
            selector: 'inquiry:v1-cat-message',
            kind: 'message-flow',
            label: 'Which scripts does this message reach?',
            target: CAT_MESSAGE,
        },
        {
            selector: 'inquiry:v1-cat-motion',
            kind: 'motion',
            label: 'How does Cat move around the stage?',
            target: CAT,
        },
        {
            selector: 'inquiry:v1-dog-purpose',
            kind: 'usage',
            label: 'What does this script of Dog do?',
            target: DOG,
        },
    ],
    findings: [
        {
            selector: 'finding:v1-bug',
            label: bugLabel,
            family: 'bug',
            target: CAT_FLAG,
            finder: 'MissingLoopSensing',
            scratchblocks: markedScript,
        },
        {
            selector: 'finding:v1-smell',
            label: 'A pattern that could be tidied',
            family: 'smell',
            target: PROGRAM,
            finder: 'LongScript',
            scratchblocks: '',
        },
    ],
    targets: [
        {
            key: PROGRAM,
            kind: 'program',
            label: '',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
        },
        {
            key: CAT,
            kind: 'sprite',
            label: 'Cat',
            parent: '',
            scratchblocks: '',
            thumbnail: '/litterbox/api/v1/submissions/t/assets/' + 'a'.repeat(64),
            intents: ['SUMMARISE', 'EXPLAIN'],
        },
        {
            key: DOG,
            kind: 'sprite',
            label: 'Dog',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN'],
        },
        {
            key: BIRD,
            kind: 'sprite',
            label: 'Bird',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN'],
        },
        {
            key: CAT_FLAG,
            kind: 'script',
            label: 'when green flag clicked',
            parent: CAT,
            scratchblocks: 'when green flag clicked\nmove (10) steps',
            thumbnail: null,
            intents: ['EXPLAIN', 'PROVIDE_FEEDBACK'],
        },
        {
            key: CAT_MESSAGE,
            kind: 'script',
            label: 'when I receive [go v]',
            parent: CAT,
            scratchblocks: 'when I receive [go v]\nsay [hello]',
            thumbnail: null,
            intents: ['EXPLAIN', 'PROVIDE_FEEDBACK'],
        },
    ],
};

const questionsWithSeveralProblems: AskAiQuestions = {
    ...questions,
    findings: [
        ...questions.findings,
        {
            selector: 'finding:v1-bug-2',
            label: 'Another problem on the same script',
            family: 'smell',
            target: CAT_FLAG,
            finder: 'LongScript',
            scratchblocks: markedScript,
        },
        {
            selector: 'finding:v1-smell-2',
            label: 'Another pattern that could be tidied',
            family: 'smell',
            target: PROGRAM,
            finder: 'LongScript',
            scratchblocks: '',
        },
    ],
};

const FISH = 'target:v1-fish';
const FISH_SCRIPT = 'target:v1-fish-flag';

const questionsWithOneScriptSprite: AskAiQuestions = {
    ...questions,
    inquiries: [
        ...questions.inquiries,
        {
            selector: 'inquiry:v1-fish-loop',
            kind: 'loop',
            label: 'When does this repeating part of Fish stop?',
            target: FISH_SCRIPT,
        },
    ],
    targets: [
        ...questions.targets,
        {
            key: FISH,
            kind: 'sprite',
            label: 'Fish',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN', 'SUGGEST_EXTENSION', 'PROVIDE_FEEDBACK'],
        },
        {
            key: FISH_SCRIPT,
            kind: 'script',
            label: 'when green flag clicked',
            parent: FISH,
            scratchblocks: 'when green flag clicked\nforever\nmove (10) steps\nend',
            thumbnail: null,
            intents: ['EXPLAIN', 'PROVIDE_FEEDBACK'],
        },
    ],
};

const questionsOfOneSpriteAlone: AskAiQuestions = {
    schemaVersion: 1,
    truncated: false,
    previewsTruncated: false,
    inquiries: [],
    findings: [
        {
            selector: 'finding:v1-alone-bug',
            label: '[b]Problem:[/b] this loop never ends.',
            family: 'bug',
            target: FISH_SCRIPT,
            finder: 'EndlessLoop',
            scratchblocks: markedScript,
        },
        {
            selector: 'finding:v1-alone-smell',
            label: '[b]Problem:[/b] this script is very long.',
            family: 'smell',
            target: FISH_SCRIPT,
            finder: 'LongScript',
            scratchblocks: markedScript,
        },
    ],
    targets: [
        {
            key: PROGRAM,
            kind: 'program',
            label: '',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE'],
        },
        {
            key: FISH,
            kind: 'sprite',
            label: 'Fish',
            parent: '',
            scratchblocks: '',
            thumbnail: null,
            intents: ['SUMMARISE', 'EXPLAIN'],
        },
        {
            key: FISH_SCRIPT,
            kind: 'script',
            label: 'when green flag clicked',
            parent: FISH,
            scratchblocks: 'when green flag clicked\nforever\nmove (10) steps\nend',
            thumbnail: null,
            intents: ['EXPLAIN', 'PROVIDE_FEEDBACK'],
        },
    ],
};

const UNDERSTAND = 'Understand how it works';
const PROBLEMS = 'Check for problems';
const ADD = 'Add something new';
const IMPROVE = 'See what is good or could be improved';
const UNSURE = 'Not sure? Show me an idea';

const FLAG_SCRIPT = /^Cat, script 1: when green flag clicked/;

const openChooser = (onSelect = vi.fn()) =>
    render(
        <QuestionsChooser
            questions={questions}
            project="cat-chase.sb3"
            locale="en"
            onSelect={onSelect}
        />,
    );

const trail = () => screen.getByRole('navigation', { name: 'Where you are' });
const trailSteps = () =>
    within(trail())
        .getAllByRole('listitem')
        .map((step) => step.textContent);

const goalCard = (name: string) =>
    screen.getByRole('button', {
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    });

describe('the Ask AI chooser', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('begins with what the reader came for, not with the project’s own structure', () => {
        openChooser();
        expect(
            screen.getByRole('heading', { name: 'What would you like help with?' }),
        ).toBeInTheDocument();
        for (const goal of [UNDERSTAND, PROBLEMS, ADD, IMPROVE]) {
            expect(goalCard(goal)).toBeInTheDocument();
        }
        expect(goalCard(UNDERSTAND).textContent).toContain('how each part of it works');
        expect(goalCard(UNDERSTAND).textContent).not.toMatch(/\d+ questions/);
        expect(screen.getAllByRole('button')[0]).toBe(goalCard(UNSURE));
        expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull();
    });

    it('takes a goal to a part to a question, one press each', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );

        await user.click(goalCard(PROBLEMS));
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
        expect(screen.getByRole('button', { name: /^The whole project/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: FLAG_SCRIPT })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^All of Dog/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^All of Cat/ })).toBeNull();

        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));
        expect(trailSteps()).toEqual([
            'All questions',
            PROBLEMS,
            'Cat, script 1: when green flag clicked',
        ]);
        expect(
            screen.getByRole('button', { name: /Problem: A loop never ends/ }),
        ).toBeInTheDocument();
    });

    it('reads a generated question as the explanation it is, wherever it came from', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );

        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));
        for (const name of [
            'What does this script of Cat do?',
            'How long does this script take to run?',
        ]) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }

        await user.click(within(trail()).getByRole('button', { name: 'All questions' }));
        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));
        expect(screen.queryByRole('button', { name: /How long does this script take/ })).toBeNull();
        expect(
            screen.getByRole('button', { name: /Problem: A loop never ends/ }),
        ).toBeInTheDocument();
    });

    it('reads findings detected by LitterBox as problems to look at', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));
        expect(
            screen.getByRole('button', { name: /A pattern that could be tidied/ }),
        ).toBeInTheDocument();
    });

    it('offers a part whose only questions are the general ones', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));

        await user.click(screen.getByRole('button', { name: /^All of Bird/ }));
        expect(screen.getByRole('button', { name: 'What does Bird do?' })).toBeInTheDocument();
    });

    it('never swaps a choice the reader made for one it can answer', async () => {
        const user = userEvent.setup();
        openChooser();

        await user.click(goalCard(PROBLEMS));
        await user.click(within(trail()).getByRole('button', { name: 'All questions' }));
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: /^All of Cat/ }));
        expect(trailSteps()).toEqual(['All questions', UNDERSTAND, 'Cat']);

        await user.click(within(trail()).getByRole('button', { name: UNDERSTAND }));
        expect(trailSteps()).toEqual(['All questions', UNDERSTAND]);
    });

    it('offers one way back per step, and no way back nobody can see', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        // Keep the visually hidden crumbs out of the tab order at narrow widths.
        const steps = within(trail()).getAllByRole('listitem');
        expect(steps.map((step) => step.className.includes('ask-ai-trail-previous'))).toEqual([
            false,
            true,
            false,
        ]);
        const ways = within(trail()).getAllByRole('button');
        expect(ways.map((way) => way.textContent)).toEqual(['All questions', UNDERSTAND]);
        for (const way of ways) {
            expect(way).not.toHaveAttribute('aria-hidden');
            expect(way).not.toHaveAttribute('tabindex');
        }
        await user.click(ways[1]);
        expect(trailSteps()).toEqual(['All questions', UNDERSTAND]);
    });

    it('opens straight from the goal card when its one part answers with only one question', async () => {
        const user = userEvent.setup();
        const picked: {
            scope: ConversationScope;
            from: ChooserPosition;
            about: string | null | undefined;
        }[] = [];
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={(scope, from, about) => picked.push({ scope, from, about: about?.key })}
            />,
        );

        await user.click(goalCard(ADD));

        expect(picked).toEqual([
            {
                scope: {
                    kind: 'common',
                    selector: 'common:SUGGEST_EXTENSION',
                    label: 'What could I add to this project?',
                },
                from: { goal: 'add', place: null },
                about: null,
            },
        ]);
        expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull();
    });

    it('samples this project for a reader who does not know what they want', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNSURE));

        expect(
            screen.getByRole('button', { name: /How does Cat move around the stage/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Problem: A loop never ends/ }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'What does this project do?' })).toBeNull();

        const reach = screen.getByRole('button', { name: /Which scripts does this message reach/ });
        expect(reach.textContent).toContain('Cat: when I receive');
    });

    it('comes back showing the question that was asked, even where it was one of the ones held back', () => {
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
                openAt={{ goal: 'understand', place: null }}
                restoreFocusTo="inquiry:v1-event-3"
            />,
        );
        const asked = screen.getByRole('button', { name: /Question number 4\?/ });
        expect(asked).toBeInTheDocument();
        expect(document.activeElement).toBe(asked);
        expect(screen.getByRole('status').textContent).toBe('8 questions to choose from.');
    });

    it('says how many of the questions are on show, not only how many there are', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));

        expect(screen.getByRole('status').textContent).toBe('Showing 5 of 8 questions.');
        expect(screen.queryByRole('button', { name: /Question number 4\?/ })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Show more questions' }));
        expect(screen.getByRole('status').textContent).toBe('8 questions to choose from.');
        expect(screen.getByRole('button', { name: /Question number 4\?/ })).toBeInTheDocument();
    });

    it('says this is a selection only once the reader has seen everything held back behind "Show more"', async () => {
        const user = userEvent.setup();
        // Announce truncation only after the visible list is exhausted.
        render(
            <QuestionsChooser
                questions={{ ...questions, truncated: true }}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));

        const note =
            'This project is big, so this is a selection of what you can ask about — not everything.';
        expect(screen.queryByText(note)).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Show more questions' }));
        expect(screen.getByText(note)).toBeInTheDocument();
    });

    it('names a script whose code the listing left out, and says why, without an empty code panel', async () => {
        const user = userEvent.setup();
        const withoutCode: AskAiQuestions = {
            ...questions,
            previewsTruncated: true,
            targets: questions.targets.map((target) =>
                target.key === CAT_FLAG ? { ...target, scratchblocks: '' } : target,
            ),
        };
        const { container } = render(
            <QuestionsChooser
                questions={withoutCode}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(UNDERSTAND));

        const note =
            'This project is big, so some scripts are shown by name instead of their blocks. You can still ask about them.';
        expect(screen.getByText(note)).toBeInTheDocument();
        const card = screen.getByRole('button', { name: FLAG_SCRIPT });
        // Seen, not only heard: the words stand where the blocks would have.
        expect(card.querySelector('.ask-ai-target-name')).toHaveTextContent(
            'Cat, script 1: when green flag clicked',
        );
        expect(card.querySelector('.ask-ai-script-preview')).toBeNull();

        await user.click(card);
        expect(container.querySelector('.ask-ai-open-script')).toBeNull();
        expect(
            screen.getByRole('button', { name: /How does this script work/ }),
        ).toBeInTheDocument();
    });

    it('says this is a selection straight away where there was never a "Show more" to press', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={{ ...questionsWithSeveralProblems, truncated: true }}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));

        expect(screen.queryByRole('button', { name: 'Show more questions' })).toBeNull();
        expect(
            screen.getByText(
                'This project is big, so this is a selection of what you can ask about — not everything.',
            ),
        ).toBeInTheDocument();
    });

    it('never says a project is a selection when the service sent everything it has', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));
        await user.click(screen.getByRole('button', { name: 'Show more questions' }));

        expect(
            screen.queryByText(
                'This project is big, so this is a selection of what you can ask about — not everything.',
            ),
        ).toBeNull();
    });

    it('tells apart two scripts of one sprite that start on the same block', async () => {
        const user = userEvent.setup();
        const sameTrigger: AskAiQuestions = {
            ...questions,
            targets: questions.targets.map((target) =>
                target.key === CAT_MESSAGE
                    ? { ...target, label: 'when green flag clicked' }
                    : target,
            ),
        };
        render(
            <QuestionsChooser
                questions={sameTrigger}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(UNDERSTAND));

        expect(screen.getByRole('button', { name: FLAG_SCRIPT })).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Cat, script 2: when green flag clicked. 2 questions',
            }),
        ).toBeInTheDocument();
    });

    it('offers a sprite whose code is one script as one place rather than as two', async () => {
        const user = userEvent.setup();
        const picked: { label: string; about: string | null | undefined }[] = [];
        render(
            <QuestionsChooser
                questions={questionsWithOneScriptSprite}
                project="cat-chase.sb3"
                locale="en"
                onSelect={(scope, _from, about) =>
                    picked.push({ label: scope.label, about: about?.key })
                }
            />,
        );

        await user.click(goalCard(IMPROVE));
        expect(screen.getByRole('button', { name: /^All of Fish/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Fish, script 1/ })).toBeNull();
        await user.click(screen.getByRole('button', { name: /^All of Fish/ }));
        expect(picked).toEqual([
            { label: 'What works well in Fish, and what could be improved?', about: FISH },
        ]);

        await user.click(within(trail()).getByRole('button', { name: 'All questions' }));
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: /^All of Fish/ }));
        for (const name of [
            'What does Fish do?',
            'How does Fish work?',
            'When does this repeating part of Fish stop?',
        ]) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(screen.queryByRole('button', { name: 'How does this script work?' })).toBeNull();
        expect(screen.getByText('when green flag clicked', { exact: false })).toBeInTheDocument();
    });

    it('takes the reader straight to the questions when the one place is a collapsed sprite', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(
            <QuestionsChooser
                questions={questionsOfOneSpriteAlone}
                project="fish.sb3"
                locale="en"
                onSelect={onSelect}
            />,
        );

        await user.click(goalCard(PROBLEMS));
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
        expect(screen.getByRole('button', { name: /this loop never ends/ })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /this script is very long/ }),
        ).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();

        expect(screen.getByText('when green flag clicked', { exact: false })).toBeInTheDocument();
    });

    it('speaks a script’s trigger as the words behind its markup', async () => {
        const user = userEvent.setup();
        // Use plain text, not rich-hint markup, for the accessible name.
        const marked: AskAiQuestions = {
            ...questions,
            targets: questions.targets.map((target) =>
                target.key === CAT_MESSAGE
                    ? { ...target, label: 'when the message [bc]go[/bc] is received' }
                    : target,
            ),
        };
        render(
            <QuestionsChooser
                questions={marked}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(UNDERSTAND));

        const script = screen.getByRole('button', { name: /^Cat, script 2/ });
        expect(script.getAttribute('aria-label')).not.toContain('[bc]');
        expect(script.getAttribute('aria-label')).toContain('when the message go is received');
    });

    it('says what LitterBox noticed is LitterBox’s own, and reads it as what it is', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        const heading = screen.getByRole('heading', { name: 'What LitterBox noticed here' });
        const bugFinding = within(heading.parentElement as HTMLElement).getByRole('button', {
            name: /Problem: A loop never ends/,
        });
        expect(bugFinding.textContent).not.toContain('Suggestion for code improvement');
        expect(bugFinding.textContent).not.toContain('[b]');
    });

    it('draws the blocks a problem was reported in, and marks where it was reported', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );
        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        const bug = screen.getByRole('button', { name: /Problem: A loop never ends/ });
        expect(bug.querySelector('.ask-ai-question-code')).not.toBeNull();
        expect(bug).toHaveAccessibleName(/Problem: A loop never ends/);
        expect(bug).not.toHaveAccessibleName(/#ff0000/);

        await user.click(within(trail()).getByRole('button', { name: PROBLEMS }));
        await user.click(screen.getByRole('button', { name: /^The whole project/ }));
        const pattern = screen.getByRole('button', { name: /A pattern that could be tidied/ });
        expect(pattern.querySelector('.ask-ai-question-code')).toBeNull();
    });

    it('reports the picked question and where in the chooser it was picked', async () => {
        const user = userEvent.setup();
        const picked: { scope: ConversationScope; from: ChooserPosition }[] = [];
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={(scope, from) => picked.push({ scope, from })}
            />,
        );

        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));
        await user.click(screen.getByRole('button', { name: 'What does this script of Cat do?' }));

        expect(picked).toEqual([
            {
                scope: {
                    kind: 'inquiry',
                    selector: 'inquiry:v1-cat-purpose',
                    label: 'What does this script of Cat do?',
                    // Follow-up policy needs the inquiry kind; selectors are opaque.
                    inquiryKind: 'usage',
                },
                from: { goal: 'understand', place: CAT_FLAG },
            },
        ]);
    });

    it('picking a part with only one question opens it, with the same arguments the question screen would pass', async () => {
        const user = userEvent.setup();
        const picked: {
            scope: ConversationScope;
            from: ChooserPosition;
            about: string | null | undefined;
        }[] = [];
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={(scope, from, about) => picked.push({ scope, from, about: about?.key })}
            />,
        );

        await user.click(goalCard(PROBLEMS));
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        expect(picked).toEqual([
            {
                scope: { kind: 'finding', selector: 'finding:v1-bug', label: bugLabel },
                from: { goal: 'problems', place: CAT_FLAG },
                about: CAT_FLAG,
            },
        ]);
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
    });

    it('still shows the question screen when a part answers with more than one', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={onSelect}
            />,
        );

        await user.click(goalCard(PROBLEMS));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        expect(trailSteps()).toEqual([
            'All questions',
            PROBLEMS,
            'Cat, script 1: when green flag clicked',
        ]);
        expect(
            screen.getByRole('button', { name: /Problem: A loop never ends/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Another problem on the same script/ }),
        ).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('lets a reader climb back out the way they came in', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));

        await user.click(within(trail()).getByRole('button', { name: UNDERSTAND }));
        expect(document.activeElement).toBe(screen.getByRole('button', { name: FLAG_SCRIPT }));

        await user.click(within(trail()).getByRole('button', { name: 'All questions' }));
        expect(document.activeElement).toBe(goalCard(UNDERSTAND));
    });

    it('opens where the reader last was, rather than at the top', () => {
        render(
            <QuestionsChooser
                questions={questionsWithSeveralProblems}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
                openAt={{ goal: 'problems', place: CAT_FLAG }}
            />,
        );
        expect(
            screen.getByRole('button', { name: /Problem:\s*A loop never ends/i }),
        ).toBeInTheDocument();
    });

    it('opens one screen up from a part whose only question was already asked, not on that question alone', () => {
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
                openAt={{ goal: 'problems', place: CAT_FLAG }}
                restoreFocusTo="finding:v1-bug"
            />,
        );
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
        expect(screen.getByRole('button', { name: FLAG_SCRIPT })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Problem: A loop never ends/ })).toBeNull();
        expect(document.activeElement).toBe(within(trail()).getByRole('heading'));
    });

    it('opens the first screen from a one-part goal whose only question was already asked', () => {
        render(
            <QuestionsChooser
                questions={questions}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
                openAt={{ goal: 'add', place: null }}
                restoreFocusTo="common:SUGGEST_EXTENSION"
            />,
        );
        expect(
            screen.getByRole('heading', { name: 'What would you like help with?' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull();
        expect(document.activeElement).toBe(
            screen.getByRole('heading', { name: 'What would you like help with?' }),
        );
    });

    it('says how many choices arrived, for a reader who cannot see the screen change', async () => {
        const user = userEvent.setup();
        openChooser();
        await user.click(goalCard(UNDERSTAND));
        expect(screen.getByRole('status').textContent).toBe('6 parts to choose from.');
        await user.click(screen.getByRole('button', { name: FLAG_SCRIPT }));
        expect(screen.getByRole('status').textContent).toBe('3 questions to choose from.');
    });

    it('says LitterBox found nothing rather than dropping the card that would have said so', async () => {
        const user = userEvent.setup();
        render(
            <QuestionsChooser
                questions={{ ...questions, findings: [] }}
                project="cat-chase.sb3"
                locale="en"
                onSelect={vi.fn()}
            />,
        );

        const card = goalCard(PROBLEMS);
        expect(card).toBeInTheDocument();

        await user.click(card);
        // Do not announce the empty state both in its own live region and in the screen-change status.
        expect(
            screen.getAllByText('LitterBox did not find any problems in this project.'),
        ).toHaveLength(1);
        expect(screen.getByRole('status').textContent).toBe(
            'LitterBox did not find any problems in this project.',
        );
        expect(
            screen.getByText(
                'You can still ask how it works, what to add, or what could be better.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: FLAG_SCRIPT })).toBeNull();
        expect(trailSteps()).toEqual(['All questions', PROBLEMS]);
    });

    it('gives every button a real accessible name and keyboard focusability', async () => {
        const user = userEvent.setup();
        openChooser();
        for (const goal of [UNDERSTAND, PROBLEMS, IMPROVE]) {
            await user.click(goalCard(goal));
            for (const button of screen.getAllByRole('button')) {
                expect(button).toHaveAccessibleName();
                expect(button.getAttribute('tabindex')).not.toBe('-1');
            }
            await user.click(within(trail()).getByRole('button', { name: 'All questions' }));
        }
    });
});
