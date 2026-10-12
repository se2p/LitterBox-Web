// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { beforeEach, describe, expect, it, vi } from 'vitest';

const scratchblocksMocks = vi.hoisted(() => ({
    loadScratchblocks: vi.fn(),
    loadScratchblocksStyles: vi.fn(),
    loadScratchblocksLanguages: vi.fn(),
    createScratchblocksRenderer: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
}));

vi.mock('../src/lib/dynamic-libraries', () => ({
    loadScratchblocks: scratchblocksMocks.loadScratchblocks,
    loadScratchblocksStyles: scratchblocksMocks.loadScratchblocksStyles,
    loadScratchblocksLanguages: scratchblocksMocks.loadScratchblocksLanguages,
    createScratchblocksRenderer: scratchblocksMocks.createScratchblocksRenderer,
}));

import {
    assessmentHtml,
    assessmentJson,
    alphabeticChoiceLabel,
    parseAssessmentImport as parseImportWithLimits,
    safeAssessmentFilename,
    type AssessmentAnswerKey,
    type AssessmentExport,
    type AssessmentExportLabels,
} from '../src/components/questions/assessment-export';

const parseAssessmentImport = (text: string) =>
    parseImportWithLimits(text, DEFAULT_ASSESSMENT_LIMITS);
import i18n from '../src/i18n';
import type { AssessmentResults } from '../src/api/assessments';
import { DEFAULT_ASSESSMENT_LIMITS } from '../src/api/capabilities';
import {
    assessmentResultsCsv,
    type AssessmentResultsCsvLabels,
} from '../src/components/questions/assessment-results-csv';

const renderBlock = (source: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-source', source);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.textContent = `drawn: ${source}`;
    svg.append(label);
    return svg;
};

const mockRendererReady = () => {
    scratchblocksMocks.loadScratchblocks.mockResolvedValue({});
    scratchblocksMocks.loadScratchblocksStyles.mockResolvedValue('.sb3-motion { fill: #4c97ff; }');
    scratchblocksMocks.loadScratchblocksLanguages.mockResolvedValue({});
    scratchblocksMocks.parse.mockImplementation((source: string) => ({ source }));
    scratchblocksMocks.render.mockImplementation((model: { source: string }) =>
        renderBlock(model.source),
    );
    scratchblocksMocks.createScratchblocksRenderer.mockImplementation(() => ({
        parse: scratchblocksMocks.parse,
        render: scratchblocksMocks.render,
    }));
};

const assessment: AssessmentExport = {
    title: 'Loops & events',
    instructions: 'Explain your reasoning.',
    locale: 'en',
    project: 'synthetic.sb3',
    analysisId: 88,
    questions: [
        {
            id: 'generated-1',
            sourceQuestionId: 'q-1',
            source: 'generated',
            question: 'What happens <first>?',
            questionType: 'MULTIPLE_CHOICE',
            options: ['Move & turn', 'Stop'],
            correctAnswers: [],
            expectedAnswers: 1,
            answerGuide: 'Move & turn',
            scratchBlocks: 'when green flag clicked\nmove (10) steps',
            programDimension: 'EXECUTION',
            scopeOfFocus: 'BLOCK',
        },
        {
            id: 'teacher-1',
            source: 'teacher',
            question: 'Why?',
            questionType: 'FREE_TEXT',
            options: [],
            correctAnswers: [],
            expectedAnswers: 1,
        },
    ],
};

const labels: AssessmentExportLabels = {
    studentName: 'Name',
    studentClass: 'Class',
    question: 'Question',
    hint: 'Hint',
    codeContext: 'Code',
    answerGuide: 'Answer',
    answerGuideMissing: 'No guidance.',
    correctAnswers: 'Correct answer',
    yes: 'Yes',
    no: 'No',
    generatedBy: 'Prepared with LitterBox',
};

beforeEach(() => {
    vi.clearAllMocks();
    scratchblocksMocks.loadScratchblocks.mockRejectedValue(
        new Error('scratchblocks not configured for this test'),
    );
});

describe('assessment exports', () => {
    it('writes a stable editable question set with selected block-model coverage', () => {
        const value = JSON.parse(assessmentJson(assessment));

        expect(value).toEqual(
            expect.objectContaining({
                schemaVersion: 1,
                kind: 'litterbox-assessment',
                locale: 'en',
                source: {
                    project: 'synthetic.sb3',
                    analysisId: 88,
                },
            }),
        );
        expect(value.questions).toHaveLength(2);
        expect(value.questions[0]).toEqual(
            expect.objectContaining({
                number: 1,
                sourceQuestionId: 'q-1',
                answerGuide: 'Move & turn',
            }),
        );
        expect(value.blockModelCoverage.EXECUTION.BLOCK).toBe(1);
        expect(value.blockModelCoverage.TEXT.ATOM).toBe(0);
    });

    it('makes separate printable student and teacher copies and escapes authored HTML', async () => {
        const student = await assessmentHtml(assessment, 'student', labels);
        const teacher = await assessmentHtml(assessment, 'teacher', labels);

        expect(student).toContain('<html lang="en">');
        expect(student).toContain('What happens &lt;first&gt;?');
        expect(student).toContain('Move &amp; turn');
        expect(student).toContain('class="student-fields"');
        expect(student).not.toContain('<strong>Answer</strong>');
        expect(teacher).toContain('<strong>Answer</strong>');
        expect(teacher).toContain('Move &amp; turn');
        expect(teacher).toContain('No guidance.');
        expect(teacher).not.toContain('class="student-fields"');
    });

    it('labels choices past Z with spreadsheet-style letters', () => {
        expect(alphabeticChoiceLabel(25)).toBe('Z');
        expect(alphabeticChoiceLabel(26)).toBe('AA');
    });

    it('keeps the answer label, choice box, and text in separate columns', async () => {
        const student = await assessmentHtml(assessment, 'student', labels);

        expect(student).toContain(
            '<li><span class="choice-label">A.</span><span class="choice-row"><span class="choice-box"></span><span class="choice-text">Move &amp; turn</span></span></li>',
        );
        expect(student).toContain('<span class="choice-label">B.</span>');
        expect(student).toMatch(
            /\.options li\s*{[^}]*grid-template-columns:\s*1\.5rem minmax\(0, 1fr\)/,
        );
        expect(student).toMatch(/\.choice-row\s*{[^}]*display:\s*flex/);
        expect(student).toMatch(/\.choice-text\s*{[^}]*min-width:\s*0/);
    });

    it('keeps the box beside a choice that quotes a block, instead of stranded above it', async () => {
        mockRendererReady();
        const blockChoiceAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-choice',
                    source: 'teacher',
                    question: 'Which script moves the sprite?',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['[sbi]turn (15) degrees[/sbi]'],
                    expectedAnswers: 1,
                },
            ],
        };
        const student = await assessmentHtml(blockChoiceAssessment, 'student', labels);

        const choiceMatch = student.match(
            /<li><span class="choice-label">A\.<\/span><span class="choice-row"><span class="choice-box"><\/span><span class="choice-text">(.*?)<\/span><\/span><\/li>/s,
        );
        expect(choiceMatch).not.toBeNull();
        expect(choiceMatch![1]).toContain('scratchblocks-export');
    });

    it('makes a safe bounded filename', () => {
        expect(safeAssessmentFilename('  Loops & Events / 1  ')).toBe('loops-events-1');
        expect(safeAssessmentFilename('***')).toBe('litterbox-assessment');
        expect(safeAssessmentFilename('x'.repeat(200))).toHaveLength(80);
    });

    it.each([
        ['de', 'Quiz zu Projekt', 'Frage 3 in das Quiz aufnehmen'],
        ['en-US', 'Projekt quiz', 'Include question 3 in quiz'],
        ['es', 'Cuestionario de Projekt', 'Incluir la pregunta 3 en el cuestionario'],
        ['nl', 'Quiz over Projekt', 'Vraag 3 in de quiz opnemen'],
    ])(
        'keeps feature-local assessment copy in the selected language %s',
        async (locale, title, include) => {
            await i18n.changeLanguage(locale);
            await i18n.loadNamespaces('assessment');
            const t = i18n.getFixedT(locale, 'assessment');
            expect(t('defaultTitle', { project: 'Projekt' })).toBe(title);
            expect(t('includeQuestion', { number: 3 })).toBe(include);
            await i18n.changeLanguage('en');
        },
    );

    it("renders the site's own markup in a question's prompt, hint and answer guide, whoever wrote it", async () => {
        const authored: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'rich-1',
                    sourceQuestionId: 'q-rich',
                    source: 'generated',
                    question: '[b]What happens[/b] here?',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    hint: 'Look at [i]this[/i] part.',
                },
                {
                    id: 'teacher-rich',
                    source: 'teacher',
                    question: 'Explain the [b]loop[/b].',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['[i]Not italic in markdown[/i]'],
                    expectedAnswers: 1,
                    answerGuide: 'Because of the [bc]repeat[/bc] block.',
                    hint: 'Look at [u]this[/u] part too.',
                },
            ],
        };
        const student = await assessmentHtml(authored, 'student', labels);
        const teacher = await assessmentHtml(authored, 'teacher', labels);

        expect(student).toContain('<strong>What happens</strong> here?');
        expect(student).toContain('Look at <em>this</em> part.');
        expect(student).toContain('Explain the <strong>loop</strong>.');
        expect(student).toContain('<em>Not italic in markdown</em>');
        expect(student).toContain('Look at <u>this</u> part too.');
        expect(teacher).toContain('Because of the <code>repeat</code> block.');
    });

    it("leaves a teacher's markdown syntax as the literal characters they typed", async () => {
        const markdownish: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'literal-1',
                    source: 'teacher',
                    question: '**Not bold** — this is not the markup this site uses.',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    answerGuide: 'Nor is `this`.',
                },
            ],
        };
        const teacher = await assessmentHtml(markdownish, 'teacher', labels);

        expect(teacher).toContain('**Not bold** — this is not the markup this site uses.');
        expect(teacher).not.toContain('<strong>Not bold</strong>');
        expect(teacher).toContain('Nor is `this`.');
        expect(teacher).not.toContain('<code>this</code>');
    });

    it('escapes raw HTML a teacher typed into the question or answer guide instead of parsing it', async () => {
        const dangerous: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'html-1',
                    source: 'teacher',
                    question: '<img src=x onerror=alert(1)>',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    answerGuide: '<script>alert(1)</script>',
                },
            ],
        };
        const student = await assessmentHtml(dangerous, 'student', labels);
        const teacher = await assessmentHtml(dangerous, 'teacher', labels);

        expect(student).not.toContain('<img src=x');
        expect(student).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(teacher).not.toContain('<script>alert(1)</script>');
        expect(teacher).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it("keeps a teacher's own line breaks in the printed question and answer guide", async () => {
        const multiline: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'lines-1',
                    source: 'teacher',
                    question: 'Read the script.\nThen say what it does.',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    answerGuide: 'Look for the repeat.\n\nOne mark for naming the counter.',
                },
            ],
        };
        const student = await assessmentHtml(multiline, 'student', labels);
        const teacher = await assessmentHtml(multiline, 'teacher', labels);

        expect(student).toContain('Read the script.<br>Then say what it does.');
        expect(teacher).toContain('Read the script.<br>Then say what it does.');
        expect(teacher).toContain(
            '<p>Look for the repeat.<br><br>One mark for naming the counter.</p>',
        );
        expect(teacher).not.toContain('<p></p>');
        expect(student).not.toContain('Look for the repeat.');
    });

    it('escapes raw HTML inside a generated question, its hint, and its choices instead of parsing it', async () => {
        const dangerous: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'html-2',
                    sourceQuestionId: 'q-html',
                    source: 'generated',
                    question: '[b]Bold[/b] <img src=x onerror=alert(1)>',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['<script>alert(1)</script>'],
                    expectedAnswers: 1,
                    hint: '<svg onload=alert(1)>',
                },
            ],
        };
        const student = await assessmentHtml(dangerous, 'student', labels);

        expect(student).toContain('<strong>Bold</strong>');
        expect(student).not.toContain('<img src=x');
        expect(student).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(student).not.toContain('<script>alert(1)</script>');
        expect(student).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(student).not.toContain('<svg onload=alert(1)>');
        expect(student).toContain('&lt;svg onload=alert(1)&gt;');
    });
});

describe('teacher copy answer key', () => {
    it("prints a generated question's correct answer in the teacher copy and never in the student copy", async () => {
        const answerKey: AssessmentAnswerKey = new Map([['q-1', ['Stop']]]);

        const teacher = await assessmentHtml(assessment, 'teacher', labels, answerKey);
        const student = await assessmentHtml(assessment, 'student', labels, answerKey);

        expect(teacher).toContain('<strong>Correct answer</strong>');
        expect(teacher).toContain('<li>Stop</li>');
        expect(student).not.toContain('<strong>Correct answer</strong>');
        expect(student).not.toContain('<li>Stop</li>');
    });

    it('shows a correct answer and a teacher-authored guidance note together when both exist', async () => {
        const answerKey: AssessmentAnswerKey = new Map([['q-1', ['Move & turn']]]);

        const teacher = await assessmentHtml(assessment, 'teacher', labels, answerKey);

        const firstQuestion = teacher.split('data-litterbox-question-id="teacher-1"')[0] ?? '';
        expect(firstQuestion).toContain('<strong>Correct answer</strong>');
        expect(firstQuestion).toContain('<li>Move &amp; turn</li>');
        expect(firstQuestion).toContain('<p>Move &amp; turn</p>');
        expect(firstQuestion).not.toContain('No guidance.');
    });

    it('says no guidance was added only when a question has neither a correct answer nor a guidance note', async () => {
        const answerKey: AssessmentAnswerKey = new Map([['q-1', ['Stop']]]);

        const teacher = await assessmentHtml(assessment, 'teacher', labels, answerKey);

        const secondQuestion = teacher.split('data-litterbox-question-id="teacher-1"')[1] ?? '';
        expect(secondQuestion).toContain('No guidance.');
        expect(secondQuestion).not.toContain('<strong>Correct answer</strong>');
    });

    it("prints a teacher-authored question's own accepted answers, which no answer key ever speaks about", async () => {
        const marked: AssessmentExport = {
            ...assessment,
            questions: [
                { ...assessment.questions[1], correctAnswers: ['it repeats', 'loops forever'] },
            ],
        };

        const teacher = await assessmentHtml(marked, 'teacher', labels, new Map());
        const student = await assessmentHtml(marked, 'student', labels, new Map());

        expect(teacher).toContain('<strong>Correct answer</strong>');
        expect(teacher).toContain('<li>it repeats</li>');
        expect(teacher).toContain('<li>loops forever</li>');
        expect(teacher).not.toContain('No guidance.');
        expect(student).not.toContain('it repeats');
    });

    it("prints the teacher's own key for an edited generated question, not the analyser's", async () => {
        const edited: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    ...assessment.questions[0],
                    options: ['Glide', 'Spin'],
                    correctAnswers: ['Spin'],
                },
            ],
        };
        const answerKey: AssessmentAnswerKey = new Map([['q-1', ['Stop']]]);

        const teacher = await assessmentHtml(edited, 'teacher', labels, answerKey);

        expect(teacher).toContain('<li>Spin</li>');
        expect(teacher).not.toContain('<li>Stop</li>');
    });

    it('joins a correct answer on the generated question id, not the export’s own resequenced id', async () => {
        const wrongJoin: AssessmentAnswerKey = new Map([['generated-1', ['Stop']]]);
        const rightJoin: AssessmentAnswerKey = new Map([['q-1', ['Stop']]]);

        const wrong = await assessmentHtml(assessment, 'teacher', labels, wrongJoin);
        const right = await assessmentHtml(assessment, 'teacher', labels, rightJoin);

        const wrongFirstQuestion = wrong.split('data-litterbox-question-id="teacher-1"')[0] ?? '';
        expect(wrongFirstQuestion).not.toContain('<li>Stop</li>');
        const rightFirstQuestion = right.split('data-litterbox-question-id="teacher-1"')[0] ?? '';
        expect(rightFirstQuestion).toContain('<li>Stop</li>');
    });

    it('draws a correct answer that quotes a block the same way a matching option would', async () => {
        mockRendererReady();
        const blockAnswerAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-answer',
                    sourceQuestionId: 'q-block-answer',
                    source: 'generated',
                    question: 'Which script moves the sprite?',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['[sbi]turn (15) degrees[/sbi]', 'Nothing'],
                    expectedAnswers: 1,
                },
            ],
        };
        const answerKey: AssessmentAnswerKey = new Map([
            ['q-block-answer', ['[sbi]turn (15) degrees[/sbi]']],
        ]);

        const teacher = await assessmentHtml(blockAnswerAssessment, 'teacher', labels, answerKey);

        const correctAnswersBlock = teacher.match(/<div class="correct-answers">.*?<\/div>/s)?.[0];
        expect(correctAnswersBlock).toBeDefined();
        expect(correctAnswersBlock).toContain('scratchblocks-export');
        expect(correctAnswersBlock).toContain('drawn: turn (15) degrees');
    });
});

describe('assessment export scratchblocks rendering', () => {
    it("draws a question's code context as inline SVG and embeds the scratchblocks stylesheet", async () => {
        mockRendererReady();
        const blockAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-1',
                    source: 'teacher',
                    question: 'What does this script do?',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    scratchBlocks: 'when green flag clicked\nmove (10) steps',
                },
            ],
        };
        const student = await assessmentHtml(blockAssessment, 'student', labels);

        expect(student).toContain('<span class="scratchblocks-export"><svg');
        expect(student).toContain('drawn: when green flag clicked\nmove (10) steps');
        expect(student).not.toContain('<pre class="scratchblocks-export-fallback"');
        expect(student).toContain('<style>.sb3-motion { fill: #4c97ff; }</style>');
        expect(student).not.toMatch(/<link[^>]+stylesheet/);
        expect(student).not.toContain('<script');
    });

    it('draws an inline block quoted inside a generated question, its hint, and a multiple-choice option', async () => {
        mockRendererReady();
        const inlineAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-2',
                    sourceQuestionId: 'q-block',
                    source: 'generated',
                    question: 'What does [sbi]move (10) steps[/sbi] do?',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['[sbi]turn (15) degrees[/sbi]', 'Nothing'],
                    expectedAnswers: 1,
                    hint: 'Look at [sbi]move (10) steps[/sbi] again.',
                },
            ],
        };
        const student = await assessmentHtml(inlineAssessment, 'student', labels);

        expect(student).toContain('drawn: move (10) steps');
        expect(student).toContain('drawn: turn (15) degrees');
        expect(student.match(/drawn: move \(10\) steps/g)).toHaveLength(2);
        expect(scratchblocksMocks.render).toHaveBeenCalledTimes(2);
    });

    it('falls back to the plain source, and still produces a usable file, when the renderer will not load', async () => {
        scratchblocksMocks.loadScratchblocks.mockRejectedValue(new Error('chunk failed to fetch'));
        const blockAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-3',
                    source: 'teacher',
                    question: 'What does this script do?',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    scratchBlocks: 'when green flag clicked\nmove (10) steps',
                },
            ],
        };

        const student = await assessmentHtml(blockAssessment, 'student', labels);

        expect(student).toContain(
            '<pre class="scratchblocks-export-fallback">when green flag clicked\nmove (10) steps</pre>',
        );
        expect(student).not.toContain('scratchblocks-export">');
        expect(student).not.toContain('.sb3-motion');
        expect(student).toContain('<!doctype html>');
        expect(student).toContain('What does this script do?');
    });

    it('escapes a hostile scratchblocks source in the fallback instead of parsing it as HTML', async () => {
        scratchblocksMocks.loadScratchblocks.mockRejectedValue(new Error('renderer unavailable'));
        const hostileAssessment: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'block-4',
                    source: 'teacher',
                    question: 'Q',
                    questionType: 'FREE_TEXT',
                    options: [],
                    expectedAnswers: 1,
                    scratchBlocks: '<img src=x onerror=alert(1)>',
                },
            ],
        };

        const student = await assessmentHtml(hostileAssessment, 'student', labels);

        expect(student).not.toContain('<img src=x');
        expect(student).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
});

const importQuestion = (overrides: Record<string, unknown> = {}) => ({
    id: 'q-1',
    source: 'teacher',
    question: 'Which script moves the cat?',
    questionType: 'MULTIPLE_CHOICE',
    options: ['A', 'B'],
    correctAnswers: [],
    expectedAnswers: 1,
    ...overrides,
});

const importFile = (questions: unknown[], overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
        kind: 'litterbox-assessment',
        schemaVersion: 1,
        title: 'Quiz',
        instructions: '',
        questions,
        ...overrides,
    });

describe('assessment import', () => {
    it('checks the source project when importing into a question bank', () => {
        const file = assessmentJson(assessment);
        expect(parseImportWithLimits(file, DEFAULT_ASSESSMENT_LIMITS, assessment.project).ok).toBe(
            true,
        );
        expect(parseImportWithLimits(file, DEFAULT_ASSESSMENT_LIMITS, 'other-project.sb3')).toEqual(
            { ok: false, reason: 'wrong-project' },
        );
        const withoutSource = JSON.parse(file);
        delete withoutSource.source;
        expect(
            parseImportWithLimits(
                JSON.stringify(withoutSource),
                DEFAULT_ASSESSMENT_LIMITS,
                assessment.project,
            ),
        ).toEqual({ ok: false, reason: 'wrong-project' });
    });

    it.each([99, undefined])(
        'accepts the same project with source analysis ID %s',
        (analysisId) => {
            const saved = JSON.parse(assessmentJson(assessment));
            saved.source.analysisId = analysisId;
            const result = parseImportWithLimits(
                JSON.stringify(saved),
                DEFAULT_ASSESSMENT_LIMITS,
                assessment.project,
            );
            expect(result.ok).toBe(true);
        },
    );

    it('rejects duplicate question IDs or generated source references', () => {
        const first = assessment.questions[0];
        for (const duplicate of [first, { ...first, id: 'different-id' }]) {
            const file = assessmentJson({ ...assessment, questions: [first, duplicate] });
            expect(parseAssessmentImport(file)).toEqual({ ok: false, reason: 'invalid-shape' });
        }
    });

    it('round-trips an exported assessment back into the same questions', () => {
        const result = parseAssessmentImport(assessmentJson(assessment));

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('expected import to succeed');
        expect(result.title).toBe(assessment.title);
        expect(result.instructions).toBe(assessment.instructions);
        expect(result.questions).toEqual(assessment.questions);
    });

    it("carries a teacher's answer key through the file and back, for every kind of question", () => {
        const marked: AssessmentExport = {
            ...assessment,
            questions: [
                {
                    id: 'teacher-choice',
                    source: 'teacher',
                    question: 'Which one?',
                    questionType: 'MULTIPLE_CHOICE',
                    options: ['First', 'Second'],
                    correctAnswers: ['Second'],
                    expectedAnswers: 1,
                },
                {
                    id: 'teacher-yes-no',
                    source: 'teacher',
                    question: 'Does it loop?',
                    questionType: 'YES_NO',
                    options: [],
                    correctAnswers: ['yes'],
                    expectedAnswers: 1,
                },
                {
                    id: 'teacher-number',
                    source: 'teacher',
                    question: 'How many sprites?',
                    questionType: 'NUMBER',
                    options: [],
                    correctAnswers: ['3'],
                    expectedAnswers: 1,
                },
                {
                    id: 'teacher-free-text',
                    source: 'teacher',
                    question: 'Why?',
                    questionType: 'FREE_TEXT',
                    options: [],
                    correctAnswers: ['it repeats', 'loop'],
                    expectedAnswers: 1,
                },
            ],
        };

        const result = parseAssessmentImport(assessmentJson(marked));

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('expected import to succeed');
        expect(result.questions.map((question) => question.correctAnswers)).toEqual([
            ['Second'],
            ['yes'],
            ['3'],
            ['it repeats', 'loop'],
        ]);
    });

    it('reads a question with no correct answers at all, as every file used to be written', () => {
        const result = parseAssessmentImport(
            JSON.stringify({
                schemaVersion: 1,
                kind: 'litterbox-assessment',
                title: 'Old file',
                instructions: '',
                questions: [
                    {
                        id: 'teacher-1',
                        source: 'teacher',
                        question: 'Why?',
                        questionType: 'FREE_TEXT',
                        options: [],
                        expectedAnswers: 1,
                    },
                ],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('expected import to succeed');
        expect(result.questions[0].correctAnswers).toEqual([]);
    });

    it('keeps every question of a file exported from a service configured past the shipped floors', () => {
        const roomy = { ...DEFAULT_ASSESSMENT_LIMITS, maxQuestions: 260, maxOptions: 60 };
        const file = JSON.stringify({
            kind: 'litterbox-assessment',
            schemaVersion: 1,
            title: 'A long quiz',
            instructions: '',
            questions: Array.from({ length: 260 }, (_, index) => ({
                id: `q${index}`,
                source: 'teacher',
                question: 'Which script moves the cat?',
                questionType: 'MULTIPLE_CHOICE',
                options: Array.from({ length: 60 }, (_, choice) => `Choice ${choice}`),
                correctAnswers: [],
                expectedAnswers: 1,
            })),
        });

        const roomyResult = parseImportWithLimits(file, roomy);
        expect(roomyResult.ok).toBe(true);
        if (!roomyResult.ok) throw new Error('expected the file to parse');
        expect(roomyResult.questions).toHaveLength(260);
        expect(roomyResult.questions[0].options).toHaveLength(60);

        expect(parseAssessmentImport(file)).toEqual({ ok: false, reason: 'over-limit' });
    });

    it('rejects text that is not valid JSON', () => {
        expect(parseAssessmentImport('{not json')).toEqual({ ok: false, reason: 'invalid-json' });
    });

    it('rejects a file of the wrong kind', () => {
        expect(
            parseAssessmentImport(JSON.stringify({ kind: 'something-else', schemaVersion: 1 })),
        ).toEqual({ ok: false, reason: 'wrong-kind' });
    });

    it('rejects an unsupported schema version', () => {
        expect(
            parseAssessmentImport(
                JSON.stringify({ kind: 'litterbox-assessment', schemaVersion: 2 }),
            ),
        ).toEqual({ ok: false, reason: 'unsupported-schema' });
    });

    it('rejects a truncated file missing its questions', () => {
        expect(
            parseAssessmentImport(
                JSON.stringify({
                    kind: 'litterbox-assessment',
                    schemaVersion: 1,
                    title: 'x',
                    instructions: '',
                }),
            ),
        ).toEqual({ ok: false, reason: 'invalid-shape' });
    });

    it('rejects a question list holding something other than well-formed question objects', () => {
        expect(
            parseAssessmentImport(
                JSON.stringify({
                    kind: 'litterbox-assessment',
                    schemaVersion: 1,
                    title: 'x',
                    instructions: '',
                    questions: ['not-a-question', 42, null, {}],
                }),
            ),
        ).toEqual({ ok: false, reason: 'invalid-shape' });
    });

    it('never throws on a hostile or malformed payload', () => {
        const hostile = [
            'null',
            '42',
            '"just a string"',
            '[]',
            JSON.stringify({
                kind: 'litterbox-assessment',
                schemaVersion: 1,
                title: 'x',
                instructions: 'x',
                questions: [{ id: 'a' }],
            }),
            '{"__proto__": {"polluted": true}}',
        ];
        for (const payload of hostile) {
            expect(() => parseAssessmentImport(payload)).not.toThrow();
            expect(parseAssessmentImport(payload).ok).toBe(false);
        }
    });

    it('rejects an expected answer count outside 1 to the number of options', () => {
        for (const expectedAnswers of [99, 0, -1, 1.5, '1', null]) {
            expect(
                parseAssessmentImport(
                    importFile([importQuestion({ options: ['A', 'B'], expectedAnswers })]),
                ),
            ).toEqual({ ok: false, reason: 'invalid-shape' });
        }
    });

    it('rejects unknown or missing question metadata instead of changing its meaning', () => {
        const bad: Record<string, unknown>[] = [
            { questionType: 'MULTIPLE_CHOIC' },
            { questionType: undefined },
            { source: 'robot' },
            { source: undefined },
            { programDimension: 'NOPE' },
            { scopeOfFocus: 'NOPE' },
        ];
        for (const overrides of bad) {
            expect(parseAssessmentImport(importFile([importQuestion(overrides)]))).toEqual({
                ok: false,
                reason: 'invalid-shape',
            });
        }
    });

    describe('questions whose fields disagree', () => {
        const rejected = (overrides: Record<string, unknown>) =>
            expect(parseAssessmentImport(importFile([importQuestion(overrides)]))).toEqual({
                ok: false,
                reason: 'invalid-shape',
            });

        it('rejects a correct answer that is not an offered option', () => {
            rejected({ correctAnswers: ['C'], expectedAnswers: 1 });
        });

        it('rejects a marked count that disagrees with the expected count', () => {
            rejected({ correctAnswers: ['A', 'B'], expectedAnswers: 1 });
            rejected({ correctAnswers: ['A'], expectedAnswers: 2 });
            rejected({ correctAnswers: ['A', 'a'], expectedAnswers: 2 });
        });

        it('rejects a non-choice question that carries options or expects several answers', () => {
            for (const questionType of ['FREE_TEXT', 'YES_NO', 'NUMBER']) {
                rejected({ questionType, options: ['A', 'B'], expectedAnswers: 1 });
                rejected({ questionType, options: [], expectedAnswers: 2 });
            }
        });

        it('rejects yes/no and numeric keys of the wrong shape', () => {
            rejected({ questionType: 'YES_NO', options: [], correctAnswers: ['maybe'] });
            rejected({ questionType: 'YES_NO', options: [], correctAnswers: ['yes', 'no'] });
            rejected({ questionType: 'NUMBER', options: [], correctAnswers: ['three'] });
            rejected({ questionType: 'NUMBER', options: [], correctAnswers: ['1', '2'] });
            rejected({ questionType: 'FREE_TEXT', options: [], correctAnswers: ['ok', '  '] });
        });

        it('keeps every consistent or merely unfinished question unchanged', () => {
            const exported = (
                questionType: AssessmentExport['questions'][number]['questionType'],
                extra: Partial<AssessmentExport['questions'][number]>,
                id: string,
            ): AssessmentExport['questions'][number] => ({
                id,
                source: 'teacher',
                question: 'Q?',
                questionType,
                options: [],
                correctAnswers: [],
                expectedAnswers: 1,
                ...extra,
            });
            const questions = [
                exported(
                    'MULTIPLE_CHOICE',
                    { options: ['A', 'B', 'C'], correctAnswers: ['A', 'C'], expectedAnswers: 2 },
                    'mc-multi',
                ),
                exported(
                    'MULTIPLE_CHOICE',
                    { options: ['A', 'B', 'C'], expectedAnswers: 2 },
                    'mc-unmarked',
                ),
                exported('MULTIPLE_CHOICE', { options: [], expectedAnswers: 1 }, 'mc-unfinished'),
                exported('YES_NO', { correctAnswers: ['yes'] }, 'yn'),
                exported('YES_NO', {}, 'yn-unmarked'),
                exported('NUMBER', { correctAnswers: ['3'] }, 'num'),
                exported('NUMBER', {}, 'num-unmarked'),
                exported('FREE_TEXT', { correctAnswers: ['loop', 'repeat'] }, 'free'),
                exported('FREE_TEXT', {}, 'free-unmarked'),
                {
                    ...exported('YES_NO', { options: ['yes', 'no'], expectedAnswers: 2 }, 'gen'),
                    source: 'generated' as const,
                    sourceQuestionId: 'gen',
                },
            ];
            const result = parseAssessmentImport(assessmentJson({ ...assessment, questions }));

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('expected import to succeed');
            expect(result.questions).toEqual(questions);
        });
    });

    describe('content beyond the limits or of the wrong type', () => {
        const limits = DEFAULT_ASSESSMENT_LIMITS;

        it('rejects rather than truncates too many questions', () => {
            const many = Array.from({ length: limits.maxQuestions + 1 }, (_, index) =>
                importQuestion({ id: `q-${index}` }),
            );
            expect(parseAssessmentImport(importFile(many))).toEqual({
                ok: false,
                reason: 'over-limit',
            });
        });

        it('measures the file against the deployment limits, not only the parsing bounds', () => {
            const deployment = DEFAULT_ASSESSMENT_LIMITS;
            const over = (file: string) =>
                expect(parseAssessmentImport(file)).toEqual({ ok: false, reason: 'over-limit' });

            over(
                importFile(
                    Array.from({ length: deployment.maxQuestions + 1 }, (_, i) =>
                        importQuestion({ id: `q-${i}` }),
                    ),
                ),
            );
            over(
                importFile([
                    importQuestion({
                        options: Array.from(
                            { length: deployment.maxOptions + 1 },
                            (_, i) => `${i}`,
                        ),
                    }),
                ]),
            );
            over(
                importFile([importQuestion()], {
                    title: 'T'.repeat(deployment.maxTitleLength + 1),
                }),
            );
            over(
                importFile([
                    importQuestion({ question: 'Q'.repeat(deployment.maxQuestionTextLength + 1) }),
                ]),
            );
        });

        it('rejects too many options or correct answers', () => {
            const many = Array.from({ length: limits.maxOptions + 1 }, (_, i) => `Choice ${i}`);
            for (const field of ['options', 'correctAnswers']) {
                expect(
                    parseAssessmentImport(importFile([importQuestion({ [field]: many })])),
                ).toEqual({ ok: false, reason: 'over-limit' });
            }
        });

        it('rejects over-long strings', () => {
            const long = 'x'.repeat(100_000);
            for (const field of ['question', 'answerGuide', 'hint', 'id']) {
                expect(
                    parseAssessmentImport(importFile([importQuestion({ [field]: long })])),
                ).toEqual({ ok: false, reason: 'over-limit' });
            }
            expect(
                parseAssessmentImport(importFile([importQuestion({ options: [long] })])),
            ).toEqual({ ok: false, reason: 'over-limit' });
            expect(parseAssessmentImport(importFile([importQuestion()], { title: long }))).toEqual({
                ok: false,
                reason: 'over-limit',
            });
        });

        it('rejects non-string entries and fields instead of dropping them', () => {
            for (const field of ['options', 'correctAnswers']) {
                expect(
                    parseAssessmentImport(
                        importFile([importQuestion({ [field]: ['A', 7, null] })]),
                    ),
                ).toEqual({ ok: false, reason: 'invalid-shape' });
                expect(
                    parseAssessmentImport(importFile([importQuestion({ [field]: 'A' })])),
                ).toEqual({ ok: false, reason: 'invalid-shape' });
            }
            expect(parseAssessmentImport(importFile([importQuestion({ hint: 5 })]))).toEqual({
                ok: false,
                reason: 'invalid-shape',
            });
        });

        it('still round-trips a file that fits exactly within the limits', () => {
            const options = Array.from({ length: limits.maxOptions }, (_, i) => `Choice ${i}`);
            const questions = Array.from({ length: limits.maxQuestions }, (_, index) =>
                importQuestion({ id: `q-${index}`, options, correctAnswers: [options[0]] }),
            );
            const result = parseAssessmentImport(importFile(questions));

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('expected import to succeed');
            expect(result.questions).toHaveLength(limits.maxQuestions);
            expect(result.questions[0]?.options).toEqual(options);
        });
    });
});

describe('quiz results as a spreadsheet', () => {
    const results: AssessmentResults = {
        schemaVersion: 1,
        title: 'Chapter 3 quiz',
        status: 'OPEN',
        expiresAt: '2099-01-01T00:00:00Z',
        totalAttempts: 5,
        questions: [
            {
                questionId: 'q1',
                questionText: 'Which [b]blocks[/b] start a script, and why?',
                answered: 4,
                correct: 3,
                incorrect: 1,
                notMarkable: 0,
                answerTallies: [
                    { answer: 'The flag', count: 4 },
                    { answer: '=SUM(A1:A9)', count: 2 },
                ],
                otherAnswers: 1,
            },
            {
                questionId: 'q2',
                questionText: 'Why?',
                answered: 2,
                correct: 0,
                incorrect: 0,
                notMarkable: 2,
                answerTallies: [],
                otherAnswers: 0,
            },
        ],
        scores: { markableQuestions: 1, completedAttempts: 4, partialAttempts: 1, counts: [1, 3] },
    };

    const csvLabels: AssessmentResultsCsvLabels = {
        question: 'Question',
        answered: 'Answered',
        correct: 'Correct',
        incorrect: 'Incorrect',
        notMarkable: 'Not markable',
        otherAnswers: 'Other',
        tallyAnswer: (position) => `Choice ${position}`,
        tallyCount: (position) => `Chosen by ${position}`,
        answerText: (answer) => (answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : answer),
    };

    const lines = () => assessmentResultsCsv(results, 'en', csvLabels).split('\r\n');

    it('writes one row per question, with the choices as numbered column pairs', () => {
        expect(lines()[0]).toBe(
            'Question,Answered,Correct,Incorrect,Not markable,Other,Choice 1,Chosen by 1,Choice 2,Chosen by 2',
        );
        expect(lines()[1]).toBe(
            '"Which blocks start a script, and why?",4,3,1,0,1,The flag,4,\'=SUM(A1:A9),2',
        );
    });

    it('leaves a question with no choices of its own empty in the choice columns', () => {
        expect(lines()[2]).toBe('Why?,2,0,0,2,0,,,,');
    });

    it("ends every row with CRLF, as a spreadsheet expects; the byte-order mark is the saved file's", () => {
        expect(assessmentResultsCsv(results, 'en', csvLabels).endsWith('\r\n')).toBe(true);
    });

    it('spells out the two yes/no tokens rather than writing the words the service marks by', () => {
        const yesNo: AssessmentResults = {
            ...results,
            questions: [
                {
                    ...results.questions[0],
                    questionText: 'Is the cat visible?',
                    answerTallies: [
                        { answer: 'yes', count: 3 },
                        { answer: 'no', count: 1 },
                    ],
                },
            ],
        };

        expect(assessmentResultsCsv(yesNo, 'en', csvLabels)).toContain(
            'Is the cat visible?,4,3,1,0,1,Yes,3,No,1',
        );
    });
});
