// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import { BatchAnalyticsWorkspace } from '../src/components/batch/BatchAnalyticsWorkspace';
import { batchRows, summarizeBatch, type BatchRow } from '../src/components/batch/batch-summary';
import { featureMatrix } from '../src/components/batch/batch-analytics';
import { buildCatalogueLookup } from '../src/components/single-project/catalogue-lookup';
import { forgetProjects, rememberProject } from '../src/lib/recent-projects';
import type { BatchAnalysis, CatalogueEntry } from '../src/api/submissions';
import { response } from './helpers';

const analysis = (
    id: number,
    issues: unknown[] = [],
    metrics: Record<string, number> = { block_count: id * 10 },
): BatchAnalysis =>
    ({
        id,
        name: `synthetic-${id}.sb3`,
        status: 'completed',
        metrics,
        issues,
    }) as unknown as BatchAnalysis;

/** Read off the row's own label rather than by text, because each row also carries its project's name a second
 *  time inside the visually-hidden part of its "Inspect report" button, and a plain text query finds both. */
const namedProjects = (group: HTMLElement): string[] =>
    [...group.querySelectorAll('.batch-triage-project')].map((element) => element.textContent);

const catalogueEntry = (id: string, description: string): CatalogueEntry =>
    ({
        id,
        title: `Title for ${id}`,
        description,
        locale: 'en',
        fallback: false,
        instruction: '',
        examples: [],
        issueType: 'bug',
    }) as unknown as CatalogueEntry;

const renderWorkspace = (
    rows: BatchRow[],
    overrides: Partial<ComponentProps<typeof BatchAnalyticsWorkspace>> = {},
) =>
    render(
        <MemoryRouter>
            <BatchAnalyticsWorkspace
                rows={rows}
                matrix={featureMatrix(rows)}
                finders={summarizeBatch(rows.map((row) => row.analysis)).finders}
                projects={<p>synthetic project table</p>}
                exportContent={() => <p>synthetic export</p>}
                {...overrides}
            />
        </MemoryRouter>,
    );

/** The `<details>` one reading of the class set folds into, found by the heading inside its own `<summary>`. */
const foldFor = (title: string): HTMLElement =>
    screen.getByRole('heading', { name: title }).closest('details') as HTMLElement;

const openFold = async (
    user: ReturnType<typeof userEvent.setup>,
    title: string,
): Promise<HTMLElement> => {
    const fold = foldFor(title);
    if (!fold.hasAttribute('open')) {
        await user.click(within(fold).getByText(title).closest('summary')!);
    }
    return fold;
};

const openMetricsFold = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
    return openFold(user, 'Metrics and feature matrix');
};

describe('batch analytics workspace', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.restoreAllMocks();
        forgetProjects();
    });

    it('renders a numbered workspace hierarchy without adding another h2', () => {
        const rows = batchRows([analysis(1), analysis(2), analysis(3), analysis(4)]);
        renderWorkspace(rows);

        expect(
            screen.getByRole('heading', { level: 3, name: 'Class set analysis' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { level: 4, name: 'Class overview' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { level: 2, name: 'Class set analysis' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Class set sections' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Review projects' })).toHaveAttribute(
            'href',
            '#batch-projects',
        );
        expect(screen.getByText('synthetic project table')).toBeInTheDocument();
        expect(foldFor('Metrics and feature matrix')).not.toHaveAttribute('open');
        expect(foldFor('Programming concepts across the class')).not.toHaveAttribute('open');
        expect(foldFor('Computational thinking across the class')).not.toHaveAttribute('open');
        expect(foldFor('Compare with the task')).not.toHaveAttribute('open');
        expect(foldFor('Projects worth a closer look')).not.toHaveAttribute('open');
        expect(
            screen.getByText(
                'Class set analysis uses all completed project reports. The filters below only change the report list.',
            ),
        ).toBeVisible();
    });

    it('announces an empty filtered cohort instead of drawing empty analytics tables', () => {
        renderWorkspace([]);

        expect(screen.getByRole('status')).toHaveTextContent(
            'No completed analyses match the current filters.',
        );
        expect(screen.getByText('synthetic project table')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('separates finding families and uses explicit project-filter actions', async () => {
        const rows = batchRows([
            analysis(1, [{ finderId: 'bug', finderName: 'Bug finder', type: 'bug' }]),
            analysis(2, [{ finderId: 'smell', finderName: 'Smell finder', type: 'smell' }]),
            analysis(3, [{ finderId: 'perfume', finderName: 'Perfume finder', type: 'perfume' }]),
        ]);
        renderWorkspace(rows, { onFinderFilter: vi.fn() });

        const findingsSection = await openFold(userEvent.setup(), 'Findings across the class');
        expect(findingsSection).not.toBeNull();
        expect(
            within(findingsSection).getByRole('heading', {
                name: 'Bugs 1 finder type',
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Smells 1/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Perfumes 1/ })).toBeInTheDocument();
        expect(screen.getByText('Perfume finder')).not.toHaveRole('button');
        expect(screen.getAllByRole('button', { name: 'Show projects' })).toHaveLength(3);
    });

    const bugFinders = (count: number) =>
        Array.from({ length: count }, (_, index) =>
            analysis(index + 1, [
                { finderId: `bug-${index}`, finderName: `Bug finder ${index}`, type: 'bug' },
            ]),
        );

    it('offers to show all finding types once a family exceeds the preview size', async () => {
        renderWorkspace(batchRows(bugFinders(7)));
        await openFold(userEvent.setup(), 'Findings across the class');

        expect(
            screen.getByRole('button', { name: 'Show all 7 finding types' }),
        ).toBeInTheDocument();
    });

    it('has no show-all control while every family stays within the preview size', async () => {
        renderWorkspace(batchRows(bugFinders(6)));
        await openFold(userEvent.setup(), 'Findings across the class');

        expect(
            screen.queryByRole('button', { name: /Show all \d+ finding types/ }),
        ).not.toBeInTheDocument();
    });

    it('shares a configurable metric selection between visual summaries and the matrix', async () => {
        const rows = batchRows([
            analysis(1, [], { block_count: 10, sprite_count: 2, avg_line_width: 4 }),
            analysis(2, [], { block_count: 20, sprite_count: 3, avg_line_width: 6 }),
        ]);
        renderWorkspace(rows);

        await openMetricsFold(userEvent.setup());
        expect(
            screen.getByText(
                'The selected metrics are used in both views and in the feature-matrix download.',
            ),
        ).toBeVisible();
        expect(
            screen.getAllByRole('img', { name: '2 of 2 projects report this metric.' }),
        ).toHaveLength(2);
        expect(screen.getByRole('checkbox', { name: 'Average line width' })).toBeVisible();
        await userEvent.setup().type(screen.getByLabelText('Find a metric'), 'sprite');
        expect(screen.getByRole('checkbox', { name: 'Sprites' })).toBeVisible();
        expect(screen.queryByRole('checkbox', { name: 'Blocks' })).not.toBeInTheDocument();
        expect(screen.getByText('synthetic export')).toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button', { name: 'Full feature matrix' }));
        expect(screen.getByRole('table', { name: 'Full feature matrix' })).toBeVisible();
        expect(screen.getByText('synthetic export')).toBeVisible();
        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: 'Metric distributions and coverage' }));
        await userEvent.setup().click(screen.getByRole('button', { name: 'Clear' }));
        expect(
            screen.getByText('Choose at least one metric to draw the summary or matrix.'),
        ).toBeVisible();
    });

    it('hands the export its default columns on the very first render, not on a second one', () => {
        const exportColumns: string[][] = [];
        renderWorkspace(
            batchRows([
                analysis(1, [], { block_count: 10, sprite_count: 2 }),
                analysis(2, [], { block_count: 20, sprite_count: 3 }),
            ]),
            {
                exportContent: (selected) => {
                    exportColumns.push([...selected]);
                    return <p>synthetic export</p>;
                },
            },
        );

        // The selection is read from the columns this render has rather than written into state by an effect, so
        // there is no first paint whose export and chooser are both empty.
        expect(exportColumns[0]).toContain('metric:block_count');
        expect(exportColumns[0]).toContain('metric:sprite_count');
    });

    it("keeps a teacher's own metric selection across a row-set change, and drops a column that has gone", async () => {
        const user = userEvent.setup();
        const exportColumns: string[][] = [];
        const props = {
            exportContent: (selected: readonly string[]) => {
                exportColumns.push([...selected]);
                return <p>synthetic export</p>;
            },
        };
        const withSprites = batchRows([
            analysis(1, [], { block_count: 10, sprite_count: 2 }),
            analysis(2, [], { block_count: 20, sprite_count: 3 }),
        ]);
        const { rerender } = renderWorkspace(withSprites, props);

        await openMetricsFold(user);
        await user.click(screen.getByRole('checkbox', { name: 'Sprites' }));
        expect(exportColumns.at(-1)).toContain('metric:block_count');
        expect(exportColumns.at(-1)).not.toContain('metric:sprite_count');

        // A narrower cohort, in which nothing reports sprites any more. The choice made above survives the change
        // rather than reverting to the defaults, and the column that left the matrix leaves the selection with it —
        // both read off the columns this render has, neither written back by an effect.
        const narrower = batchRows([
            analysis(3, [], { block_count: 30 }),
            analysis(4, [], { block_count: 40 }),
        ]);
        rerender(
            <MemoryRouter>
                <BatchAnalyticsWorkspace
                    rows={narrower}
                    matrix={featureMatrix(narrower)}
                    finders={[]}
                    projects={<p>synthetic project table</p>}
                    {...props}
                />
            </MemoryRouter>,
        );
        expect(exportColumns.at(-1)).toContain('metric:block_count');
        expect(exportColumns.at(-1)).not.toContain('metric:sprite_count');
    });

    it('shows raw counts and reason tags once per highlighted project', async () => {
        const rows = batchRows([
            analysis(1, [{ finderId: 'p', finderName: 'P', type: 'perfume' }], { block_count: 1 }),
            analysis(2, [], { block_count: 1 }),
            analysis(3, [], { block_count: 1 }),
            ...Array.from({ length: 6 }, (_, index) =>
                analysis(index + 4, [], { block_count: 50 }),
            ),
        ]);
        const inspect = vi.fn();
        renderWorkspace(rows, { onProjectInspect: inspect });
        await openFold(userEvent.setup(), 'Projects worth a closer look');

        const fold = foldFor('Projects worth a closer look');
        expect(namedProjects(fold)).toEqual(['synthetic-1.sb3', 'synthetic-4.sb3']);
        expect(within(fold).getByText('Smallest project')).toBeInTheDocument();
        expect(within(fold).getByText('Largest project')).toBeInTheDocument();
        expect(within(fold).getByText('0 bugs · 0 code smells · 1 block')).toBeInTheDocument();
        expect(within(fold).getByText('0 bugs · 0 code smells · 50 blocks')).toBeInTheDocument();
        await userEvent
            .setup()
            .click(within(fold).getAllByRole('button', { name: /Inspect report/ })[0]);
        expect(inspect).toHaveBeenCalledWith('1');
    });

    it('combines bug and small project reasons and keeps small projects in bug rankings', async () => {
        const bugs = (count: number) =>
            Array.from({ length: count }, (_, index) => ({
                finderId: `f${index}`,
                finderName: `F${index}`,
                type: 'bug',
            }));
        const rows = batchRows([
            analysis(1, bugs(1), { block_count: 1 }),
            analysis(2, [], { block_count: 1 }),
            analysis(3, bugs(8), { block_count: 100 }),
            analysis(4, bugs(1), { block_count: 100 }),
            ...Array.from({ length: 5 }, (_, index) =>
                analysis(index + 5, [], { block_count: 100 }),
            ),
        ]);
        const filter = vi.fn();
        renderWorkspace(rows, { onProjectSetFilter: filter });
        await openFold(userEvent.setup(), 'Projects worth a closer look');

        const fold = foldFor('Projects worth a closer look');
        expect(namedProjects(fold)).toEqual(['synthetic-3.sb3', 'synthetic-1.sb3']);
        expect(within(fold).getAllByText('Bugs to check')).toHaveLength(2);
        expect(within(fold).getByText('Smallest project')).toBeInTheDocument();
        expect(within(fold).getByText('Largest project')).toBeInTheDocument();
        const projectOne = within(fold).getByText('synthetic-1.sb3').closest('li') as HTMLElement;
        expect(within(projectOne).getByText('Bugs to check')).toBeInTheDocument();
        expect(within(projectOne).getByText('Smallest project')).toBeInTheDocument();
        await userEvent
            .setup()
            .click(within(fold).getByRole('button', { name: /Show these 2 projects/ }));
        expect(filter).toHaveBeenCalledWith(
            'triage',
            new Set(['3', '1']),
            'Projects worth a closer look',
        );
    });

    it('separates the finding rate from its denominator instead of printing them as a fraction', async () => {
        const rows = batchRows([
            analysis(1, [{ finderId: 'f', finderName: 'F', type: 'bug' }], { block_count: 100 }),
            analysis(2, [{ finderId: 'f', finderName: 'F', type: 'bug' }], { block_count: 100 }),
            analysis(3, [], { block_count: 50 }),
            analysis(4, [], {}),
        ]);
        renderWorkspace(rows);
        await openFold(userEvent.setup(), 'Findings across the class');

        expect(
            screen.getByRole('columnheader', { name: 'Finding rate (per 1,000 blocks)' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('columnheader', { name: 'Projects with a block count' }),
        ).toBeInTheDocument();
        const finderRow = screen.getByText('F').closest('tr') as HTMLElement;
        expect(within(finderRow).getByText('8')).toBeInTheDocument();
        expect(screen.queryByText('8 / 3')).not.toBeInTheDocument();
        expect(within(finderRow).getByText('3')).toBeInTheDocument();
        expect(within(finderRow).getByText('2 / 4 (50%)')).toBeInTheDocument();
    });

    it('shows what the catalogue says about a finder, and says plainly when it has nothing', async () => {
        const rows = batchRows([
            analysis(1, [
                { finderId: 'documented', finderName: 'Documented finder', type: 'bug' },
                { finderId: 'undocumented', finderName: 'Undocumented finder', type: 'bug' },
            ]),
        ]);
        const catalogue = buildCatalogueLookup([
            catalogueEntry('documented', 'This pattern means the sprite never checks its costume.'),
        ]);
        renderWorkspace(rows, { catalogue: catalogue });

        const user = userEvent.setup();
        await openFold(user, 'Findings across the class');
        const documentedRow = screen.getByText('Documented finder').closest('tr') as HTMLElement;
        const documentedButton = within(documentedRow).getByRole('button', {
            name: 'What is this: Documented finder?',
        });
        // Short enough on screen that it can never wrap onto a second line, however narrow the column: a single
        // character has nowhere to break. The accessible name carries the words a bare "?" cannot.
        expect(documentedButton).toHaveTextContent('?');
        expect(documentedButton.textContent).not.toContain('What is this');
        expect(documentedButton).toHaveAccessibleName('What is this: Documented finder?');
        await user.click(documentedButton);
        expect(
            screen.getByText('This pattern means the sprite never checks its costume.'),
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Open the full catalogue' })).toHaveAttribute(
            'href',
            '/catalogue',
        );

        const undocumentedRow = screen
            .getByText('Undocumented finder')
            .closest('tr') as HTMLElement;
        const undocumentedButton = within(undocumentedRow).getByRole('button', {
            name: 'What is this: Undocumented finder?',
        });
        // Not the same accessible name twice — a screen reader moving down the column hears which finder each
        // button belongs to.
        expect(undocumentedButton).toHaveAccessibleName('What is this: Undocumented finder?');
        await user.click(undocumentedButton);
        expect(screen.getByText('No catalogue entry is available for this finder.')).toBeVisible();
    });

    it('lets a concept filter the project report list the way a finder already does', async () => {
        const rows = batchRows([
            analysis(1, [], { variables_block_count: 3 }),
            analysis(2, [], { variables_block_count: 0 }),
        ]);
        const onProjectSetFilter = vi.fn();
        renderWorkspace(rows, { onProjectSetFilter: onProjectSetFilter });

        const conceptsSection = await openFold(
            userEvent.setup(),
            'Programming concepts across the class',
        );
        const variablesRow = within(conceptsSection)
            .getByText('Variables')
            .closest('tr') as HTMLElement;
        await userEvent
            .setup()
            .click(within(variablesRow).getByRole('button', { name: 'Show projects' }));
        expect(onProjectSetFilter).toHaveBeenCalledWith(
            'concept:variables',
            new Set(['1']),
            'Variables · Contains it',
        );
    });

    it('shows only currently measured concepts and groups them like task analysis', async () => {
        const rows = batchRows([
            analysis(1, [], { variables_block_count: 3 }),
            analysis(2, [], { variables_block_count: 0 }),
        ]);
        renderWorkspace(rows);

        const conceptsSection = await openFold(
            userEvent.setup(),
            'Programming concepts across the class',
        );
        const table = within(conceptsSection).getByRole('table');
        // The measured concept is grouped under the same curriculum heading used on task analysis.
        expect(
            within(table)
                .getAllByRole('rowheader')
                .map((cell) => cell.textContent),
        ).toEqual(['Data and abstraction', 'Variables']);
        expect(within(table).queryByText(/Not reported by any analysis/)).not.toBeInTheDocument();
        expect(within(table).queryByRole('columnheader', { name: 'Not measured' })).toBeNull();
        expect(conceptsSection.querySelector('#batch-concepts-unmeasured')).toBeNull();
    });

    it('lets a computational-thinking level filter the project report list', async () => {
        const rows = batchRows([
            analysis(1, [], { ct_score: 8, ct_score_flow_control: 2 }),
            analysis(2, [], { ct_score: 12, ct_score_flow_control: 2 }),
            analysis(3, [], {}),
        ]);
        const onProjectSetFilter = vi.fn();
        renderWorkspace(rows, { onProjectSetFilter: onProjectSetFilter });

        const ctSection = await openFold(
            userEvent.setup(),
            'Computational thinking across the class',
        );
        const flowControlRow = within(ctSection)
            .getByText('Flow control')
            .closest('tr') as HTMLElement;
        expect(
            within(ctSection).getByRole('img', {
                name: 'Overall scores: minimum 8, lower quartile 9, median 10, upper quartile 11, maximum 12.',
            }),
        ).toBeInTheDocument();
        expect(
            within(ctSection).getByText(
                'Overall scores are available for 2 of 3 completed reports (1 not measured).',
            ),
        ).toBeInTheDocument();
        const filterButton = within(flowControlRow).getByRole('button');
        expect(filterButton).toHaveTextContent('2');
        await userEvent.setup().click(filterButton);
        expect(onProjectSetFilter).toHaveBeenCalledWith(
            'ct:classic:flowControl:2',
            new Set(['1', '2']),
            'Flow control · Level 2',
        );
    });

    it('lets a metric card drill down to the projects at each end, excludes a project missing the metric from both, and clears on a second press', async () => {
        const rows = batchRows([
            analysis(1, [], { block_count: 5 }),
            analysis(2, [], { block_count: 480 }),
            analysis(3, [], {}), // Completed, but this report never carried a block count.
            analysis(4, [], { block_count: 96 }),
        ]);
        const summary = summarizeBatch(rows.map((row) => row.analysis));
        const onProjectSetFilter = vi.fn();
        const rendered = renderWorkspace(rows, { onProjectSetFilter: onProjectSetFilter });

        const user = userEvent.setup();
        await openMetricsFold(user);
        const blocksCard = screen
            .getByRole('heading', { name: 'Blocks', level: 6 })
            .closest('article') as HTMLElement;
        expect(
            within(blocksCard).getByText(
                '1 project that does not report this metric is left out of both ends.',
            ),
        ).toBeVisible();

        const showHighest = within(blocksCard).getByRole('button', { name: /Show highest 3/ });
        await user.click(showHighest);
        expect(onProjectSetFilter).toHaveBeenCalledWith(
            'metric:block_count:high',
            new Set(['2', '4', '1']),
            'Blocks · highest',
        );
        expect(onProjectSetFilter.mock.calls[0]?.[1].has('3')).toBe(false);

        // The workspace is a controlled component: only a re-render carrying the filter back as the active one
        // shows the button pressed, the same way the parent that owns the filter state would behave.
        rendered.rerender(
            <MemoryRouter>
                <BatchAnalyticsWorkspace
                    rows={rows}
                    matrix={featureMatrix(rows)}
                    finders={summary.finders}
                    onProjectSetFilter={onProjectSetFilter}
                    activeProjectFilter="metric:block_count:high"
                    projects={<p>synthetic project table</p>}
                    exportContent={() => <p>synthetic export</p>}
                />
            </MemoryRouter>,
        );
        const pressedHighest = within(blocksCard).getByRole('button', { name: /Clear filter/ });
        expect(pressedHighest).toHaveAttribute('aria-pressed', 'true');
        await user.click(pressedHighest);
        expect(onProjectSetFilter).toHaveBeenLastCalledWith(
            'metric:block_count:high',
            new Set(['2', '4', '1']),
            'Blocks · highest',
        );

        const showLowest = within(blocksCard).getByRole('button', { name: /Show lowest 3/ });
        await user.click(showLowest);
        expect(onProjectSetFilter).toHaveBeenLastCalledWith(
            'metric:block_count:low',
            new Set(['1', '4', '2']),
            'Blocks · lowest',
        );

        const showTypical = within(blocksCard).getByRole('button', { name: /Show typical 3/ });
        await user.click(showTypical);
        expect(onProjectSetFilter).toHaveBeenLastCalledWith(
            'metric:block_count:typical',
            new Set(['4', '1', '2']),
            'Blocks · typical',
        );
    });

    it('sorts the full feature matrix before capping it, so the cap shows the top of the sort rather than response order', async () => {
        const analyses = Array.from({ length: 60 }, (_, index) => {
            const id = index + 1;
            // Response order puts the highest block count last, where a slice of the first fifty would never
            // reach it; only sorting before capping does.
            const blockCount = id === 60 ? 999 : id;
            return analysis(id, [], { block_count: blockCount });
        });
        const rows = batchRows(analyses);
        renderWorkspace(rows);

        const user = userEvent.setup();
        await openMetricsFold(user);
        await user.click(screen.getByRole('button', { name: 'Full feature matrix' }));

        const table = screen.getByRole('table', { name: 'Full feature matrix' });
        expect(within(table).queryByText('synthetic-60.sb3')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Showing 50 of 60 completed projects; export includes them all. A dash means the report did not carry that metric. Zero is a reported zero.',
            ),
        ).toBeVisible();

        const blocksHeader = within(table).getByRole('columnheader', { name: 'Blocks' });
        expect(blocksHeader).toHaveAttribute('aria-sort', 'none');
        await user.click(within(blocksHeader).getByRole('button'));
        expect(blocksHeader).toHaveAttribute('aria-sort', 'ascending');
        await user.click(within(blocksHeader).getByRole('button'));
        expect(blocksHeader).toHaveAttribute('aria-sort', 'descending');

        expect(within(table).getByText('synthetic-60.sb3')).toBeInTheDocument();
    });

    it('finds a project by name beyond the cap, and states an accurate shown-of-matching count while searching', async () => {
        const analyses = Array.from({ length: 60 }, (_, index) =>
            analysis(index + 1, [], { block_count: index + 1 }),
        );
        const rows = batchRows(analyses);
        renderWorkspace(rows);

        const user = userEvent.setup();
        await openMetricsFold(user);
        await user.click(screen.getByRole('button', { name: 'Full feature matrix' }));

        expect(screen.queryByText('synthetic-55.sb3')).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Find a project'), 'synthetic-55');
        expect(screen.getByText('synthetic-55.sb3')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Showing 1 of 1 projects matching your search, out of 60 completed; the export holds all 60. A dash means the report did not carry that metric. Zero is a reported zero.',
            ),
        ).toBeVisible();
    });

    it('offers a way to analyse a task first when this device remembers no reference task', async () => {
        const rows = batchRows([analysis(1), analysis(2)]);
        renderWorkspace(rows);

        const referenceSection = await openFold(userEvent.setup(), 'Compare with the task');
        expect(within(referenceSection).queryByRole('combobox')).not.toBeInTheDocument();
        expect(
            within(referenceSection).getByRole('link', { name: 'Analyse a task' }),
        ).toHaveAttribute('href', '/teacher/task');
    });

    it('leaves the rest of the workspace usable when the chosen reference task fails to load', async () => {
        rememberProject({ token: 'ref-token', name: 'model.sb3', kind: 'issues', analysisId: 9 });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 500));
        const rows = batchRows([analysis(1), analysis(2)]);
        renderWorkspace(rows);

        const user = userEvent.setup();
        const referenceSection = await openFold(user, 'Compare with the task');
        await user.selectOptions(within(referenceSection).getByRole('combobox'), 'ref-token:9');

        expect(
            await within(referenceSection).findByText(
                'This reference task could not be loaded. It may have expired, or the request may have failed.',
            ),
        ).toBeVisible();
        expect(
            screen.getByRole('heading', { level: 3, name: 'Class set analysis' }),
        ).toBeInTheDocument();
        expect(screen.getByText('synthetic project table')).toBeInTheDocument();
    });

    /* Below 60rem `batch.css` hides every `.batch-table` header and stacks the rows as cards, and each cell is then
       read by the `data-label` it carries. A cell without one arrives on a phone as a bare number under a project
       name, with nothing left on screen to say which column it came from. jsdom applies no media query, so this
       tests the invariant the rule depends on rather than the rule: a figure has a label to fall back on. */
    it('gives every stacked table cell a label to carry when the headers are hidden', async () => {
        const measured = (blocks: number, level: number) => ({
            block_count: blocks,
            ct_score: level * 7,
            motion_block_count: blocks,
            control_block_count: 0,
            ct_score_flow_control: level,
            ct_score_logic: level,
        });
        const rows = batchRows([
            analysis(
                1,
                [{ finderId: 'bug', finderName: 'Bug finder', type: 'bug' }],
                measured(40, 1),
            ),
            analysis(
                2,
                [{ finderId: 'smell', finderName: 'Smell finder', type: 'smell' }],
                measured(90, 3),
            ),
        ]);
        renderWorkspace(rows, { onFinderFilter: vi.fn(), onProjectSetFilter: vi.fn() });

        const user = userEvent.setup();
        await openFold(user, 'Findings across the class');
        await openFold(user, 'Metrics and feature matrix');
        await openFold(user, 'Programming concepts across the class');
        await openFold(user, 'Computational thinking across the class');
        await openFold(user, 'Projects worth a closer look');
        for (let pass = 0; pass < 5; pass += 1) {
            const collapsed = screen.queryAllByRole('button', { expanded: false });
            if (collapsed.length === 0) break;
            for (const fold of collapsed) await user.click(fold);
        }

        const unlabelled = [...document.querySelectorAll('table.batch-table td')].filter((cell) => {
            if (!cell.textContent?.trim()) return false;
            if (cell.hasAttribute('colspan')) return false;
            if (cell.querySelector('button')) return false;
            return !cell.getAttribute('data-label');
        });
        expect(unlabelled.map((cell) => cell.textContent)).toEqual([]);
        expect(
            document.querySelectorAll('table.batch-table td[data-label]').length,
        ).toBeGreaterThan(15);
    });

    it('spans the whole finder row with its explanation, with and without the filter column', async () => {
        const issues = [{ finderId: 'bug', finderName: 'Bug finder', type: 'bug' }];
        const columnCount = async (onFinderFilter?: () => void) => {
            const rows = batchRows([analysis(1, issues), analysis(2, issues)]);
            const view = renderWorkspace(rows, { onFinderFilter });
            const user = userEvent.setup();
            await openFold(user, 'Findings across the class');
            const table = view.container.querySelector(
                'table.batch-finding-table',
            ) as HTMLTableElement;
            await user.click(
                within(table).getByRole('button', { name: 'What is this: Bug finder?' }),
            );
            const headers = table.querySelectorAll('thead th').length;
            const explanation = table.querySelector('tbody tr td[colspan]') as HTMLTableCellElement;
            view.unmount();
            return { headers, span: Number(explanation.getAttribute('colspan')) };
        };

        expect(await columnCount(vi.fn())).toEqual({ headers: 7, span: 7 });
        expect(await columnCount()).toEqual({ headers: 6, span: 6 });
    });
});
