// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';
import type { CatalogueEntry } from '../src/api/submissions';
import { TaskFindingsOverview } from '../src/components/task-analysis/TaskFindingsOverview';
import { forgetProjects, rememberProject } from '../src/lib/recent-projects';
import { capabilitiesResponse, issue, response } from './helpers';

const token = 'synthetic-task-analysis-token';
const analysisId = 11;

const metrics = {
    block_count: 240,
    script_count: 18,
    sprite_count: 4,
    length_longest_script: 32,
    max_nested_block_count: 5,
    most_complex_script: 14,
    weighted_method_count: 9,
    interprocedural_cyclomatic_complexity: 12,
    motion_block_count: 6,
    boolean_operation_count: 0,
    ct_score: 11,
    ct_score_flow_control: 2,
};

const submission = () => ({
    schemaVersion: 1,
    submissionId: 9,
    token,
    status: 'completed',
    locale: 'en',
    sourceType: 'UPLOAD',
    analysis: {
        id: analysisId,
        status: 'completed',
        name: 'model-solution.sb3',
        inputFormat: 'sb3',
        metrics,
        issues: [
            issue({
                id: 1,
                type: 'bug',
                finderId: 'missing-init',
                finderName: 'Missing initialisation',
                sprite: 'Cat',
            }),
            issue({
                id: 2,
                type: 'bug',
                finderId: 'missing-init',
                finderName: 'Missing initialisation',
                sprite: 'Dog',
            }),
            issue({
                id: 3,
                type: 'smell',
                finderId: 'dead-code',
                finderName: 'Dead code',
                sprite: '',
            }),
        ],
        relationships: [],
        catalogue: [] as CatalogueEntry[],
        quiz: [],
        assetRefs: [],
    },
    analyses: [],
    counts: { expected: 1, completed: 1, failed: 0 },
});

const referenceBands = [
    { name: 'block_count', sampleSize: 40, lowerBound: 50, upperBound: 300 },
    { name: 'script_count', sampleSize: 40, lowerBound: 5, upperBound: 20 },
];

const fullReferenceBands = [
    {
        ...referenceBands[0],
        minimum: 10,
        q1: 60,
        median: 120,
        q3: 300,
        maximum: 600,
    },
    { ...referenceBands[1], minimum: 1, q1: 4, median: 8, q3: 20, maximum: 30 },
];

const serve = ({
    referenceFails = false,
    reported = submission,
    bands = referenceBands,
    features = ['single-project', 'teacher-archive'],
    extraRoutes,
}: {
    referenceFails?: boolean;
    reported?: () => ReturnType<typeof submission>;
    bands?: unknown[];
    features?: readonly string[];
    extraRoutes?: (url: string) => Response | undefined;
} = {}) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/capabilities')) return Promise.resolve(capabilitiesResponse(features));
        if (url.includes('/metrics/reference'))
            return Promise.resolve(
                referenceFails ? response(undefined, 500) : response({ metrics: bands }),
            );
        const extra = extraRoutes?.(url);
        if (extra) return Promise.resolve(extra);
        return Promise.resolve(response(reported()));
    });

const retained = {
    pathname: '/teacher/task',
    state: { retainedAnalysis: { submissionToken: token, analysisId } },
};

const renderTask = () =>
    render(
        <MemoryRouter initialEntries={[retained]}>
            <App />
        </MemoryRouter>,
    );

const resetTaskAnalysisState = async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    vi.stubGlobal('EventSource', undefined);
    forgetProjects();
};

describe('analysing a task', () => {
    beforeEach(resetTaskAnalysisState);

    afterEach(() => {
        vi.unstubAllGlobals();
        forgetProjects();
    });

    it('hands the report catalogue to the findings overview, so an explanation is there to open', async () => {
        const user = userEvent.setup();
        serve({
            reported: () => {
                const reported = submission();
                reported.analysis.catalogue = [
                    {
                        id: 'missing-init',
                        title: 'Missing initialisation',
                        description: 'A variable is read before anything ever sets it.',
                        locale: 'en',
                        fallback: false,
                        instruction: '',
                        examples: [],
                        issueType: 'bug',
                    },
                ] as unknown as CatalogueEntry[];
                return reported;
            },
        });
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        const table = screen
            .getByRole('heading', { name: 'What LitterBox found in this task' })
            .closest('.task-findings') as HTMLElement;
        await user.click(within(table).getByRole('button', { name: /Missing initialisation/ }));
        expect(within(table).getByText(/A variable is read before/)).toBeVisible();
    });

    it('renders every section for a retained analysis', async () => {
        serve();
        renderTask();

        expect(
            await screen.findByRole('heading', { name: 'What LitterBox found in this task' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Analyse a task', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByText('model-solution.sb3')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '← Back to teacher tools' })).toHaveAttribute(
            'href',
            '/teacher',
        );

        const missingInitRow = screen
            .getByText('Missing initialisation')
            .closest('tr') as HTMLElement;
        expect(within(missingInitRow).getByText('2')).toBeInTheDocument();
        const fullReportLink = screen.getByRole('link', {
            name: /View the full result for this task/,
        });
        expect(fullReportLink).toHaveAttribute(
            'href',
            expect.stringContaining(encodeURIComponent(token)),
        );
        expect(fullReportLink).toHaveAttribute('target', '_blank');

        expect(
            screen.getByRole('heading', { name: 'Computational thinking in this task' }),
        ).toBeInTheDocument();
        expect(screen.getByText('11 of 21')).toBeInTheDocument();

        expect(
            screen.getByRole('heading', {
                name: 'Programming concepts and blocks in this task',
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Block categories' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Programming concepts' })).toBeInTheDocument();

        expect(
            screen.getByRole('heading', { name: 'Size and complexity of this task' }),
        ).toBeInTheDocument();
        expect(screen.getByText('240')).toBeInTheDocument();
    });

    it('keeps a concept nobody measured apart from one measured and found absent', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', {
            name: 'Programming concepts and blocks in this task',
        });
        const booleanOperators = screen.getByText('Boolean operators').closest('li');
        const loops = screen.getByText('Loops').closest('li');
        expect(booleanOperators).not.toBeNull();
        expect(loops).not.toBeNull();
        expect(within(booleanOperators as HTMLElement).getByText('0')).toBeInTheDocument();
        expect(booleanOperators?.closest('details')).toHaveAttribute('id', 'task-concept-coverage');
        expect(loops?.closest('details')).toHaveAttribute('id', 'task-concepts-unmeasured');
    });

    it('gives a treemap tile only to a category with blocks in it, and a table row to every category', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Block categories' });
        const tiles = document.querySelectorAll('.task-blocks-tile');
        expect(tiles).toHaveLength(1);
        const motionRow = screen
            .getAllByRole('row')
            .find((row) => /^Motion/.test(row.textContent ?? ''));
        expect(within(motionRow as HTMLElement).getByText('6')).toBeInTheDocument();
        const looksRow = screen
            .getAllByRole('row')
            .find((row) => /^Looks/.test(row.textContent ?? ''));
        expect(within(looksRow as HTMLElement).getByText('Not reported')).toBeInTheDocument();
    });

    it('falls back to the tercile words when the reference carries no distribution to draw', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Size and complexity of this task' });
        const blocks = screen.getByRole('rowheader', { name: 'Blocks' }).closest('tr');
        expect(within(blocks as HTMLElement).getByText('around the middle')).toBeInTheDocument();
        expect(document.querySelector('.metric-box-plot')).toBeNull();
    });

    it('draws the distribution with a marker for this task once the reference carries one', async () => {
        serve({ bands: fullReferenceBands });
        renderTask();

        await screen.findByRole('heading', { name: 'Size and complexity of this task' });
        const blocks = screen
            .getByRole('rowheader', { name: 'Blocks' })
            .closest('tr') as HTMLElement;
        const plot = await waitFor(() => {
            const drawn = blocks.querySelector('.metric-box-plot');
            expect(drawn).not.toBeNull();
            return drawn;
        });
        expect(plot?.getAttribute('aria-label')).toContain('120');
        expect(blocks.querySelector('.metric-box-plot-marker')).not.toBeNull();
        expect(blocks.querySelector('.metric-box-plot-marker-clamped')).toBeNull();
        expect(within(blocks).queryByText('around the middle')).not.toBeInTheDocument();
    });

    it('clamps a task past the end of the distribution to the whisker and says so', async () => {
        serve({
            bands: [
                {
                    ...fullReferenceBands[0],
                    minimum: 10,
                    q1: 40,
                    median: 80,
                    q3: 120,
                    maximum: 200,
                },
                fullReferenceBands[1],
            ],
        });
        renderTask();

        await screen.findByRole('heading', { name: 'Size and complexity of this task' });
        const blocks = screen
            .getByRole('rowheader', { name: 'Blocks' })
            .closest('tr') as HTMLElement;
        await waitFor(() =>
            expect(blocks.querySelector('.metric-box-plot-marker-clamped')).not.toBeNull(),
        );
        expect(blocks.querySelector('.metric-box-plot')?.getAttribute('aria-label')).toMatch(
            /higher than every project/i,
        );
    });

    it('shows a computational-thinking dimension with no reported metric as not reported, never as level 0', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Computational thinking in this task' });
        const logicRow = screen.getByRole('row', { name: /Logic/ });
        expect(within(logicRow).getByText('Not reported')).toBeInTheDocument();
        const flowControlRow = screen.getByRole('row', { name: /Flow control/ });
        expect(within(flowControlRow).queryByText('Not reported')).not.toBeInTheDocument();
    });

    it('draws the level reached as a bar with an accessible name, and all three descriptors with the reached one marked', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Computational thinking in this task' });
        const flowControlRow = screen.getByRole('row', { name: /Flow control/ });
        expect(
            within(flowControlRow).getByRole('img', { name: 'Level 2 of 3' }),
        ).toBeInTheDocument();

        const disclosure = within(flowControlRow).getByRole('group');
        const user = userEvent.setup();
        await user.click(disclosure.querySelector('summary') as HTMLElement);
        expect(disclosure).toHaveAttribute('open');
        const descriptorList = within(disclosure).getByRole('list');
        expect(
            within(descriptorList).getByText('Runs a sequence of blocks, one after another.'),
        ).toBeVisible();
        expect(
            within(descriptorList).getByText('Repeats blocks with repeat or forever.'),
        ).toBeVisible();
        expect(within(descriptorList).getByText('Repeats blocks with repeat until.')).toBeVisible();
        const reachedItem = within(descriptorList)
            .getByText('Repeats blocks with repeat or forever.')
            .closest('li') as HTMLElement;
        expect(within(reachedItem).getByText('Reached')).toBeInTheDocument();
        expect(within(descriptorList).getAllByRole('listitem')).toHaveLength(3);
    });

    it('shows which band the computational-thinking total falls in, and says once that it is not a verdict', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Computational thinking in this task' });
        expect(screen.getByText('11 of 21')).toBeInTheDocument();
        expect(screen.getByText(/This total falls in the 8–14 band/)).toBeInTheDocument();
        expect(screen.getByText(/A low band is not a verdict on the task/)).toBeInTheDocument();
    });

    it('says nothing about a band when ct_score itself was never reported', async () => {
        serve({
            reported: () => {
                const reported = submission();
                reported.analysis.metrics = {
                    ...metrics,
                    ct_score: undefined,
                } as unknown as typeof metrics;
                return reported;
            },
        });
        renderTask();

        await screen.findByRole('heading', { name: 'Computational thinking in this task' });
        expect(screen.getByText('Not reported for this project.')).toBeInTheDocument();
        expect(screen.queryByText(/This total falls in the/)).not.toBeInTheDocument();
    });

    it('explains each dimension directly and links its Dr. Scratch examples separately', async () => {
        serve();
        renderTask();

        await screen.findByRole('heading', { name: 'Computational thinking in this task' });
        const flowControlRow = screen.getByRole('row', { name: /Flow control/ });
        expect(
            within(flowControlRow).getByText('How scripts order and repeat actions.'),
        ).toBeInTheDocument();
        const link = within(flowControlRow).getByRole('link', {
            name: 'Examples at Dr. Scratch',
        });
        expect(link).toHaveAttribute(
            'href',
            'https://www.drscratch.org/learn/Dimensions/FlowControl/',
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer noopener');
        expect(
            within(screen.getByRole('row', { name: /Logic/ })).getByRole('link', {
                name: 'Examples at Dr. Scratch',
            }),
        ).toHaveAttribute('href', 'https://www.drscratch.org/learn/Dimensions/Logic/');
    });

    it('still renders when the metric-reference request fails', async () => {
        serve({ referenceFails: true });
        renderTask();

        expect(
            await screen.findByRole('heading', { name: 'Size and complexity of this task' }),
        ).toBeInTheDocument();
        expect(screen.getByText('240')).toBeInTheDocument();
    });

    it('offers the recovery entry, not a crash, when reached with no retained analysis', async () => {
        serve();
        render(
            <MemoryRouter initialEntries={['/teacher/task']}>
                <App />
            </MemoryRouter>,
        );

        expect(
            await screen.findByRole('heading', { name: 'Analyse a task', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Your project file')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '← Back to teacher tools' })).toHaveAttribute(
            'href',
            '/teacher',
        );
    });

    it('offers nothing extra on the entry when this browser has analysed nothing yet', async () => {
        serve();
        render(
            <MemoryRouter initialEntries={['/teacher/task']}>
                <App />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { name: 'Analyse a task', level: 1 });
        expect(
            screen.queryByRole('heading', { name: 'Your recent results' }),
        ).not.toBeInTheDocument();
    });

    it('offers a way back to a project this browser analysed earlier, landing on the task page for it', async () => {
        const user = userEvent.setup();
        serve();
        rememberProject({
            token,
            name: 'model-solution.sb3',
            kind: 'issues',
            analysisId,
            at: Date.now(),
        });
        render(
            <MemoryRouter initialEntries={['/teacher/task']}>
                <App />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { name: 'Analyse a task', level: 1 });
        const recent = screen
            .getByRole('heading', { name: 'Your recent results' })
            .closest('section');
        const link = within(recent as HTMLElement).getByRole('link', {
            name: 'Look at model-solution.sb3 as a task',
        });
        expect(link).not.toHaveAttribute('href', expect.stringContaining(token));

        await user.click(link);
        expect(
            await screen.findByRole('heading', { name: 'What LitterBox found in this task' }),
        ).toBeInTheDocument();
    });
});

describe("the task page's code section, and where fault injection went", () => {
    const injectors = [
        {
            injectorId: 'injector-first',
            finderId: 'finder-first',
            name: 'First synthetic injector',
            description: 'A bounded educational description.',
        },
    ];

    const serveWithInjectors = ({
        features = ['single-project', 'fault-injection'],
        inputFormat = 'sb3',
    }: { features?: readonly string[]; inputFormat?: string } = {}) =>
        serve({
            features,
            bands: [],
            reported: () => ({
                ...submission(),
                analysis: { ...submission().analysis, inputFormat },
            }),
            extraRoutes: (url) => {
                if (url.includes('/injector-catalogue'))
                    return response({
                        injectors,
                        maxSelectedInjectors: 8,
                        allSelectionSupported: true,
                    });
                if (url.includes('/export-targets'))
                    return new Response(
                        JSON.stringify({
                            sprites: [{ name: 'Cat', stage: false }],
                            scripts: [
                                {
                                    scriptId: 'a',
                                    spriteName: 'Cat',
                                    ordinal: 1,
                                    scratchblocks: 'when green flag clicked\nmove (10) steps\n',
                                },
                            ],
                        }),
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-store',
                                'X-Content-Type-Options': 'nosniff',
                            },
                        },
                    );
                return undefined;
            },
        });

    beforeEach(resetTaskAnalysisState);

    afterEach(() => {
        vi.unstubAllGlobals();
        forgetProjects();
    });

    it('offers neither the question set nor a modified project, whatever is enabled', async () => {
        serveWithInjectors({
            features: ['single-project', 'qlc', 'fault-injection', 'program-export'],
        });
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        expect(
            screen.queryByRole('heading', { name: 'Questions about this task' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Prepare a modified project' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Fault injection')).not.toBeInTheDocument();
    });

    it('shows the project itself, last on the page, when the export capability is on', async () => {
        const user = userEvent.setup();
        serveWithInjectors({
            features: ['single-project', 'qlc', 'fault-injection', 'program-export'],
        });
        renderTask();

        const heading = await screen.findByRole('heading', { name: 'The code of this task' });
        await user.click(heading.closest('summary') as HTMLElement);
        expect(await screen.findByRole('combobox', { name: 'Sprite' })).toHaveValue('Cat');
        expect(screen.getByText(/move \(10\) steps/)).toBeInTheDocument();
    });

    it("opens the code with the one press this section's own fold asks for, not a second one behind it", async () => {
        const user = userEvent.setup();
        serveWithInjectors({
            features: ['single-project', 'qlc', 'fault-injection', 'program-export'],
        });
        renderTask();

        const heading = await screen.findByRole('heading', { name: 'The code of this task' });
        const section = document.getElementById('task-project-code') as HTMLDetailsElement;
        expect(section).not.toHaveAttribute('open');

        await user.click(heading.closest('summary') as HTMLElement);
        await screen.findByRole('combobox', { name: 'Sprite' });

        expect(section.querySelector('.project-code')).toBeNull();
    });

    it('folds every section, opens the four readings of the task and leaves the code shut', async () => {
        serveWithInjectors({ features: ['single-project', 'program-export'] });
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        const readings = [
            'task-findings',
            'task-ct-profile',
            'task-concept-coverage',
            'task-size-context',
        ];
        for (const id of [...readings, 'task-project-code']) {
            expect(document.getElementById(id)?.tagName).toBe('DETAILS');
        }
        for (const id of readings) {
            expect(document.getElementById(id)).toHaveAttribute('open');
        }
        expect(document.getElementById('task-project-code')).not.toHaveAttribute('open');
    });

    it('offers a chip for every section it rendered, in the same menu the section cards are numbered from', async () => {
        serveWithInjectors({ features: ['single-project', 'program-export'] });
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        const nav = screen.getByRole('navigation', { name: 'Task analysis sections' });
        expect(within(nav).getAllByRole('button')).toHaveLength(5);
        for (const title of [
            'Findings and feedback',
            'Computational thinking',
            'Concepts and blocks',
            'Size and complexity',
            'Project code and structure',
        ]) {
            expect(within(nav).getByRole('button', { name: title })).toBeInTheDocument();
        }
    });

    it('drops a section a deployment has switched off rather than leaving an empty fold', async () => {
        serveWithInjectors({ features: ['single-project'] });
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        expect(document.getElementById('task-project-code')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'The code of this task' }),
        ).not.toBeInTheDocument();
    });

    it('sends the old modification address to the advanced workspace, opening fault injection', async () => {
        serveWithInjectors({ features: ['single-project', 'fault-injection'] });
        render(
            <MemoryRouter initialEntries={[{ pathname: '/teacher/modify', state: retained.state }]}>
                <App />
            </MemoryRouter>,
        );

        await waitFor(() =>
            expect(
                screen.getByRole('checkbox', { name: /First synthetic injector/ }),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByRole('heading', { name: 'Advanced analysis', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('model-solution.sb3').length).toBeGreaterThan(0);
        expect(document.getElementById('advanced-injection')).toHaveAttribute('open');
    });

    it('sends a reader with no retained analysis at the old modification address to the advanced entry', async () => {
        serveWithInjectors({ features: ['single-project', 'fault-injection'] });
        render(
            <MemoryRouter initialEntries={['/teacher/modify']}>
                <App />
            </MemoryRouter>,
        );

        expect(
            await screen.findByRole('heading', { name: 'Advanced analysis', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Your project file')).toBeInTheDocument();
    });

    it('says nothing about the project itself when the export capability is off', async () => {
        serveWithInjectors();
        renderTask();

        await screen.findByRole('heading', { name: 'What LitterBox found in this task' });
        expect(
            screen.queryByRole('heading', { name: 'The code of this task' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Look at the code')).not.toBeInTheDocument();
    });
});

describe('the compact findings overview, on its own', () => {
    const findingsToken = 'synthetic-findings-overview-token';

    const catalogueEntries = [
        {
            id: 'missing-init',
            title: 'Missing initialisation',
            description: 'A variable is read before anything ever sets it.',
            locale: 'en',
            fallback: false,
            instruction: '',
            examples: [],
            issueType: 'bug',
        },
    ] as unknown as CatalogueEntry[];

    const findingsIssues = [
        issue({
            id: 1,
            type: 'bug',
            finderId: 'missing-init',
            finderName: 'Missing initialisation',
            sprite: 'Cat',
        }),
        issue({
            id: 2,
            type: 'bug',
            finderId: 'missing-init',
            finderName: 'Missing initialisation',
            sprite: 'Dog',
        }),
        issue({ id: 3, type: 'smell', finderId: 'dead-code', finderName: 'Dead code', sprite: '' }),
        issue({
            id: 4,
            type: 'perfume',
            finderId: 'custom-blocks',
            finderName: 'Uses custom blocks',
            sprite: '',
        }),
    ];

    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('shows the catalogue explanation once a finder row is expanded, and survives a finder with none', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <TaskFindingsOverview
                    issues={findingsIssues}
                    token={findingsToken}
                    locale="en"
                    catalogueEntries={catalogueEntries}
                />
            </MemoryRouter>,
        );

        const table = screen.getByRole('table', { name: 'Findings by finder' });
        const detailFor = (toggle: HTMLElement) =>
            document.getElementById(toggle.getAttribute('aria-controls') as string) as HTMLElement;

        expect(within(table).queryByText(/A variable is read before/)).not.toBeInTheDocument();
        const missingInitToggle = within(table).getByRole('button', {
            name: /Missing initialisation/,
        });
        expect(missingInitToggle).toHaveAttribute('aria-expanded', 'false');
        await user.click(missingInitToggle);
        expect(missingInitToggle).toHaveAttribute('aria-expanded', 'true');
        expect(
            within(detailFor(missingInitToggle)).getByText(/A variable is read before/),
        ).toBeVisible();

        const deadCodeToggle = within(table).getByRole('button', { name: /Dead code/ });
        await user.click(deadCodeToggle);
        expect(
            within(detailFor(deadCodeToggle)).getByText('See this finding in the full report'),
        ).toBeInTheDocument();
    });

    it('presents perfumes separately from bugs and smells, as what the task demonstrates, without a family column repeating what the heading already says', () => {
        render(
            <MemoryRouter>
                <TaskFindingsOverview
                    issues={findingsIssues}
                    token={findingsToken}
                    locale="en"
                    catalogueEntries={catalogueEntries}
                />
            </MemoryRouter>,
        );

        const reviewSection = screen
            .getByRole('heading', { name: 'Findings by finder' })
            .closest('div') as HTMLElement;
        const strengthsSection = screen
            .getByRole('heading', { name: 'What this task demonstrates' })
            .closest('div') as HTMLElement;

        expect(within(reviewSection).getByText('Missing initialisation')).toBeInTheDocument();
        expect(within(reviewSection).getByText('Dead code')).toBeInTheDocument();
        expect(within(reviewSection).queryByText('Uses custom blocks')).not.toBeInTheDocument();
        expect(
            within(reviewSection).getByRole('columnheader', { name: /Family/ }),
        ).toBeInTheDocument();

        expect(within(strengthsSection).getByText('Uses custom blocks')).toBeInTheDocument();
        expect(
            within(strengthsSection).queryByText('Missing initialisation'),
        ).not.toBeInTheDocument();
        expect(
            within(strengthsSection).queryByRole('columnheader', { name: /Family/ }),
        ).not.toBeInTheDocument();
    });

    it('links each finder through to its family in the full report, opened in a new tab so following it does not strand the reader', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <TaskFindingsOverview
                    issues={findingsIssues}
                    token={findingsToken}
                    locale="en"
                    catalogueEntries={catalogueEntries}
                />
            </MemoryRouter>,
        );

        const table = screen.getByRole('table', { name: 'Findings by finder' });
        const missingInitToggle = within(table).getByRole('button', {
            name: /Missing initialisation/,
        });
        await user.click(missingInitToggle);
        const detail = document.getElementById(
            missingInitToggle.getAttribute('aria-controls') as string,
        ) as HTMLElement;
        const link = within(detail).getByRole('link', {
            name: /See this finding in the full report/,
        });
        expect(link).toHaveAttribute('href', `/submissions/${findingsToken}#issue-family-bug`);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));

        const viewFullReport = screen.getByRole('link', {
            name: /View the full result for this task/,
        });
        expect(viewFullReport).toHaveAttribute('target', '_blank');
    });

    it('names the sprites a finder touched, counts the rest once a row names as many as it has room for, and dashes a finder that touches none', () => {
        const manySprites = [
            issue({
                id: 5,
                type: 'bug',
                finderId: 'many-sprites',
                finderName: 'Widely reported pattern',
                sprite: 'Alpha',
            }),
            issue({
                id: 6,
                type: 'bug',
                finderId: 'many-sprites',
                finderName: 'Widely reported pattern',
                sprite: 'Bravo',
            }),
            issue({
                id: 7,
                type: 'bug',
                finderId: 'many-sprites',
                finderName: 'Widely reported pattern',
                sprite: 'Charlie',
            }),
            issue({
                id: 8,
                type: 'bug',
                finderId: 'many-sprites',
                finderName: 'Widely reported pattern',
                sprite: 'Delta',
            }),
        ];
        render(
            <MemoryRouter>
                <TaskFindingsOverview
                    issues={[...findingsIssues, ...manySprites]}
                    token={findingsToken}
                    locale="en"
                    catalogueEntries={catalogueEntries}
                />
            </MemoryRouter>,
        );

        const widelyReportedRow = screen
            .getByText('Widely reported pattern')
            .closest('tr') as HTMLElement;
        expect(within(widelyReportedRow).getByText(/Alpha, Bravo, Charlie/)).toBeInTheDocument();
        expect(within(widelyReportedRow).getByText(/and 1 more/)).toBeInTheDocument();

        const deadCodeRow = screen.getByText('Dead code').closest('tr') as HTMLElement;
        expect(within(deadCodeRow).getByText('—')).toBeInTheDocument();
    });

    it('reorders the table by whichever column heading was pressed', async () => {
        const user = userEvent.setup();
        const finders = [
            issue({
                id: 10,
                type: 'bug',
                finderId: 'zebra',
                finderName: 'Zebra pattern',
                sprite: 'Cat',
            }),
            issue({
                id: 11,
                type: 'bug',
                finderId: 'zebra',
                finderName: 'Zebra pattern',
                sprite: 'Dog',
            }),
            issue({
                id: 12,
                type: 'bug',
                finderId: 'zebra',
                finderName: 'Zebra pattern',
                sprite: 'Fish',
            }),
            issue({
                id: 13,
                type: 'bug',
                finderId: 'mango',
                finderName: 'Mango pattern',
                sprite: 'Cat',
            }),
            issue({
                id: 14,
                type: 'bug',
                finderId: 'mango',
                finderName: 'Mango pattern',
                sprite: 'Dog',
            }),
            issue({
                id: 15,
                type: 'bug',
                finderId: 'alpha',
                finderName: 'Alpha pattern',
                sprite: 'Cat',
            }),
        ];
        render(
            <MemoryRouter>
                <TaskFindingsOverview issues={finders} token={findingsToken} locale="en" />
            </MemoryRouter>,
        );

        const table = screen.getByRole('table', { name: 'Findings by finder' });
        const rowNames = () =>
            within(table)
                .getAllByRole('row')
                .slice(1)
                .map((row) =>
                    within(row)
                        .getByRole('button', { name: /pattern$/ })
                        .textContent?.replace(/^[▸▾]/, ''),
                );

        expect(rowNames()).toEqual(['Zebra pattern', 'Mango pattern', 'Alpha pattern']);

        const nameHeader = within(table).getByRole('columnheader', { name: /Finder/ });
        expect(nameHeader).toHaveAttribute('aria-sort', 'none');
        await user.click(within(nameHeader).getByRole('button'));
        expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
        expect(rowNames()).toEqual(['Alpha pattern', 'Mango pattern', 'Zebra pattern']);

        await user.click(within(nameHeader).getByRole('button'));
        expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
        expect(rowNames()).toEqual(['Zebra pattern', 'Mango pattern', 'Alpha pattern']);
    });

    it('lists every finder the analysis reported, not only the five a leaderboard used to have room for', () => {
        const manyFinders = Array.from({ length: 8 }, (_, index) =>
            issue({
                id: 100 + index,
                type: 'bug',
                finderId: `finder-${index}`,
                finderName: `Finder number ${index}`,
                sprite: 'Cat',
            }),
        );
        render(
            <MemoryRouter>
                <TaskFindingsOverview issues={manyFinders} token={findingsToken} locale="en" />
            </MemoryRouter>,
        );

        manyFinders.forEach((_, index) => {
            expect(screen.getByText(`Finder number ${index}`)).toBeInTheDocument();
        });
    });
});
