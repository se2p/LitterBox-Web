// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors

import { loadScratchblocksStyles, type LocalScratchblocks } from '../../lib/dynamic-libraries';
import {
    ASSESSMENT_SHORT_TEXT_LENGTH,
    assessmentBounds,
    type AssessmentBounds,
} from '../../api/assessments';
import type { AssessmentLimits } from '../../api/capabilities';
import { isObject } from '../../api/validation';
import { canonicalCorrectAnswers } from './correct-answer-rules';
import { prepareScratchblocks } from '../../lib/scratchblocks-runtime';
import { drawScratchblocks } from '../single-project/draw-scratchblocks';
import {
    parseRichHint,
    richHintFormatTag,
    richHintTerms,
    scratchblocksSourceForInline,
    type RichHintNode,
} from '../single-project/rich-hint';
import {
    member,
    PROGRAM_DIMENSIONS,
    QUIZ_QUESTION_TYPES,
    SCOPES_OF_FOCUS,
    type ProgramDimension,
    type QuizQuestionType,
    type ScopeOfFocus,
} from './quiz-question';

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export interface AssessmentExportQuestion {
    id: string;
    sourceQuestionId?: string;
    source: 'generated' | 'teacher';
    question: string;
    questionType: QuizQuestionType;
    options: string[];
    correctAnswers?: string[];
    expectedAnswers: number;
    answerGuide?: string;
    hint?: string;
    sprite?: string;
    scratchBlocks?: string;
    programDimension?: ProgramDimension;
    scopeOfFocus?: ScopeOfFocus;
}

export interface AssessmentExport {
    title: string;
    instructions: string;
    locale: string;
    project: string;
    analysisId: number;
    questions: AssessmentExportQuestion[];
}

export interface AssessmentExportLabels {
    studentName: string;
    studentClass: string;
    question: string;
    hint: string;
    codeContext: string;
    answerGuide: string;
    answerGuideMissing: string;
    correctAnswers: string;
    yes: string;
    no: string;
    generatedBy: string;
}

export type AssessmentHtmlKind = 'student' | 'teacher';

export type AssessmentAnswerKey = ReadonlyMap<string, readonly string[]>;

const EMPTY_ANSWER_KEY: AssessmentAnswerKey = new Map();

const correctAnswersFor = (
    question: AssessmentExportQuestion,
    answerKey: AssessmentAnswerKey,
): readonly string[] => {
    const own = question.correctAnswers ?? [];
    if (own.length > 0 || question.source !== 'generated') return own;
    return (question.sourceQuestionId ? answerKey.get(question.sourceQuestionId) : undefined) ?? [];
};

const coverage = (questions: AssessmentExportQuestion[]) =>
    Object.fromEntries(
        PROGRAM_DIMENSIONS.map((dimension) => [
            dimension,
            Object.fromEntries(
                SCOPES_OF_FOCUS.map((scope) => [
                    scope,
                    questions.filter(
                        (question) =>
                            question.programDimension === dimension &&
                            question.scopeOfFocus === scope,
                    ).length,
                ]),
            ),
        ]),
    );

export const assessmentJson = (assessment: AssessmentExport): string =>
    JSON.stringify(
        {
            schemaVersion: 1,
            kind: 'litterbox-assessment',
            title: assessment.title,
            instructions: assessment.instructions,
            locale: assessment.locale,
            source: {
                project: assessment.project,
                analysisId: assessment.analysisId,
            },
            blockModelCoverage: coverage(assessment.questions),
            questions: assessment.questions.map((question, index) => ({
                number: index + 1,
                ...question,
                answerGuide: question.answerGuide || null,
                hint: question.hint || null,
                sprite: question.sprite || null,
                scratchBlocks: question.scratchBlocks || null,
                programDimension: question.programDimension || null,
                scopeOfFocus: question.scopeOfFocus || null,
            })),
        },
        null,
        2,
    );

const paragraphs = (value: string): string => escapeHtml(value).replaceAll(/\r?\n/g, '<br>');

const richHintBlockSources = (value: string, locale: string, into: Set<string>): void => {
    const walk = (nodes: RichHintNode[]): void => {
        for (const node of nodes) {
            if (node.kind === 'script') into.add(node.source);
            else if (node.kind === 'inline') into.add(scratchblocksSourceForInline(node, locale));
            else if (node.kind === 'format') walk(node.children);
        }
    };
    walk(parseRichHint(value));
};

const blockSourcesFor = (
    question: AssessmentExportQuestion,
    kind: AssessmentHtmlKind,
    locale: string,
    answerKey: AssessmentAnswerKey,
): Set<string> => {
    const sources = new Set<string>();
    if (question.scratchBlocks) sources.add(question.scratchBlocks);
    richHintBlockSources(question.question, locale, sources);
    if (question.hint) richHintBlockSources(question.hint, locale, sources);
    if (kind === 'teacher' && question.answerGuide)
        richHintBlockSources(question.answerGuide, locale, sources);
    for (const option of question.options) richHintBlockSources(option, locale, sources);
    if (kind === 'teacher')
        for (const answer of correctAnswersFor(question, answerKey))
            richHintBlockSources(answer, locale, sources);
    return sources;
};

export interface AssessmentBlockRenderer {
    renderer: LocalScratchblocks;
    stylesheet: string;
}

export const prepareAssessmentBlocks = (): Promise<AssessmentBlockRenderer | undefined> =>
    Promise.all([prepareScratchblocks(document), loadScratchblocksStyles()])
        .then(([renderer, stylesheet]) => ({ renderer, stylesheet }))
        .catch(() => undefined);

export const assessmentHasBlocks = (assessment: AssessmentExport, kind: AssessmentHtmlKind) =>
    assessment.questions.some(
        (question) => blockSourcesFor(question, kind, assessment.locale, EMPTY_ANSWER_KEY).size > 0,
    );

const renderAssessmentBlocks = async (
    sources: ReadonlySet<string>,
    locale: string,
    prepared: Promise<AssessmentBlockRenderer | undefined>,
): Promise<{ svg: ReadonlyMap<string, string>; stylesheet: string | undefined }> => {
    const svg = new Map<string, string>();
    if (sources.size === 0) return { svg, stylesheet: undefined };
    const blocks = await prepared;
    if (!blocks) return { svg, stylesheet: undefined };
    for (const source of sources) {
        try {
            const rendered = drawScratchblocks(blocks.renderer, source, { locale }, window);
            svg.set(source, new XMLSerializer().serializeToString(rendered));
        } catch {
            continue;
        }
    }
    return { svg, stylesheet: blocks.stylesheet };
};

const blockHtml = (source: string, blocks: ReadonlyMap<string, string>): string => {
    const rendered = blocks.get(source);
    return rendered
        ? `<span class="scratchblocks-export">${rendered}</span>`
        : `<pre class="scratchblocks-export-fallback">${escapeHtml(source)}</pre>`;
};

const richHintNodesHtml = (
    nodes: RichHintNode[],
    locale: string,
    blocks: ReadonlyMap<string, string>,
): string =>
    nodes
        .map((node): string => {
            switch (node.kind) {
                case 'text':
                    return escapeHtml(node.value);
                case 'lineBreak':
                    return '<br>';
                case 'format': {
                    const tag = richHintFormatTag[node.format];
                    const style =
                        node.format === 'color'
                            ? ` style="color:${escapeHtml(node.color ?? '')}"`
                            : '';
                    return `<${tag}${style}>${richHintNodesHtml(node.children, locale, blocks)}</${tag}>`;
                }
                case 'variablesBadge':
                    return `<span class="rich-hint-variables">${escapeHtml(richHintTerms(locale).variables)}</span>`;
                case 'term': {
                    const terms = richHintTerms(locale);
                    return `<strong>${escapeHtml(node.term === 'true' ? terms.trueValue : terms.falseValue)}</strong>`;
                }
                case 'script':
                    return blockHtml(node.source, blocks);
                case 'inline':
                    return blockHtml(scratchblocksSourceForInline(node, locale), blocks);
            }
        })
        .join('');

const richHintHtml = (value: string, locale: string, blocks: ReadonlyMap<string, string>): string =>
    richHintNodesHtml(parseRichHint(value), locale, blocks);

export const alphabeticChoiceLabel = (index: number): string => {
    let value = index + 1;
    let label = '';
    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return label;
};

const optionList = (
    question: AssessmentExportQuestion,
    labels: AssessmentExportLabels,
    locale: string,
    blocks: ReadonlyMap<string, string>,
): string => {
    const options =
        question.questionType === 'YES_NO' && question.options.length === 0
            ? [labels.yes, labels.no]
            : question.options;
    if (options.length === 0) return '<div class="answer-lines"><span></span><span></span></div>';
    return `<ol class="options">${options
        .map(
            (option, index) =>
                `<li><span class="choice-label">${alphabeticChoiceLabel(index)}.</span><span class="choice-row"><span class="choice-box"></span><span class="choice-text">${richHintHtml(option, locale, blocks)}</span></span></li>`,
        )
        .join('')}</ol>`;
};

const correctAnswerList = (
    answers: readonly string[],
    labels: AssessmentExportLabels,
    locale: string,
    blocks: ReadonlyMap<string, string>,
): string =>
    answers.length === 0
        ? ''
        : `<div class="correct-answers"><strong>${escapeHtml(labels.correctAnswers)}</strong><ul>${answers
              .map((answer) => `<li>${richHintHtml(answer, locale, blocks)}</li>`)
              .join('')}</ul></div>`;

const answerGuideHtml = (
    question: AssessmentExportQuestion,
    answerKey: AssessmentAnswerKey,
    labels: AssessmentExportLabels,
    locale: string,
    blocks: ReadonlyMap<string, string>,
): string => {
    const correct = correctAnswerList(
        correctAnswersFor(question, answerKey),
        labels,
        locale,
        blocks,
    );
    const guidance = question.answerGuide
        ? `<p>${richHintHtml(question.answerGuide, locale, blocks)}</p>`
        : '';
    return `<div class="answer-guide"><strong>${escapeHtml(labels.answerGuide)}</strong>${
        correct || guidance
            ? `${correct}${guidance}`
            : `<p>${escapeHtml(labels.answerGuideMissing)}</p>`
    }</div>`;
};

const questionHtml = (
    question: AssessmentExportQuestion,
    index: number,
    kind: AssessmentHtmlKind,
    labels: AssessmentExportLabels,
    locale: string,
    blocks: ReadonlyMap<string, string>,
    answerKey: AssessmentAnswerKey,
): string => {
    const context = question.scratchBlocks ? blockHtml(question.scratchBlocks, blocks) : '';
    const contextBlock = context
        ? `<div class="code-context"><strong>${escapeHtml(labels.codeContext)}</strong>${context}</div>`
        : '';
    const hint = question.hint
        ? `<p class="hint"><strong>${escapeHtml(labels.hint)}</strong> ${richHintHtml(question.hint, locale, blocks)}</p>`
        : '';
    const answer =
        kind === 'teacher'
            ? answerGuideHtml(question, answerKey, labels, locale, blocks)
            : optionList(question, labels, locale, blocks);
    const prompt = richHintHtml(question.question, locale, blocks);
    return `<section class="question" data-litterbox-question-id="${escapeHtml(question.id)}">
        <h2>${escapeHtml(labels.question)} ${index + 1}</h2>
        <div class="prompt">${prompt}</div>
        ${contextBlock}
        ${hint}
        ${answer}
    </section>`;
};

export const assessmentHtml = async (
    assessment: AssessmentExport,
    kind: AssessmentHtmlKind,
    labels: AssessmentExportLabels,
    answerKey: AssessmentAnswerKey = EMPTY_ANSWER_KEY,
    blocks?: Promise<AssessmentBlockRenderer | undefined>,
): Promise<string> => {
    const sources = new Set<string>();
    for (const question of assessment.questions)
        for (const source of blockSourcesFor(question, kind, assessment.locale, answerKey))
            sources.add(source);
    const { svg, stylesheet } = await renderAssessmentBlocks(
        sources,
        assessment.locale,
        blocks ?? (sources.size > 0 ? prepareAssessmentBlocks() : Promise.resolve(undefined)),
    );
    return `<!doctype html>
<html lang="${escapeHtml(assessment.locale)}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(assessment.title)}</title>
    <style>
        :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; }
        body { max-width: 52rem; margin: 0 auto; padding: 2.5rem; line-height: 1.45; }
        header { border-bottom: 3px solid #17202a; padding-bottom: 1rem; }
        h1 { margin: 0 0 .5rem; font-size: 2rem; }
        .instructions { white-space: normal; }
        .student-fields { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin: 2rem 0; }
        .student-fields span { display: block; min-height: 1.75rem; border-bottom: 1px solid #17202a; }
        .question { break-inside: avoid; margin: 2rem 0; padding-top: .25rem; }
        .question h2 { margin: 0 0 .75rem; font-size: 1.1rem; }
        .prompt { font-size: 1.05rem; }
        .code-context, .answer-guide { margin-top: 1rem; padding: .75rem; border: 1px solid #9aa4ae; border-radius: .35rem; }
        .code-context pre, .scratchblocks-export-fallback { margin: .5rem 0 0; padding: .75rem; overflow-wrap: anywhere; white-space: pre-wrap; background: #f5f6f7; }
        .scratchblocks-export { display: block; margin-top: .5rem; overflow-x: auto; }
        .scratchblocks-export svg { max-width: 100%; }
        .prompt p, .answer-guide p { margin: 0 0 .5rem; }
        .prompt p:last-child, .answer-guide p:last-child { margin-bottom: 0; }
        .prompt ul, .prompt ol, .answer-guide ul, .answer-guide ol { margin: 0 0 .5rem; padding-left: 1.4rem; }
        .prompt li, .answer-guide li { margin: .2rem 0; }
        .prompt code, .answer-guide code { padding: .05rem .3rem; border-radius: .25rem; background: #f5f6f7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .95em; }
        .prompt a, .answer-guide a { color: inherit; }
        .correct-answers { margin: 0 0 .5rem; }
        .correct-answers strong { display: block; margin-bottom: .25rem; }
        .hint { color: #4c5864; }
        .options { display: grid; gap: .65rem; padding: 0; list-style: none; }
        .options li { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: .5rem; break-inside: avoid; }
        .choice-label { text-align: right; }
        .choice-row { display: flex; align-items: flex-start; gap: .5rem; }
        .choice-box { flex: none; width: .9rem; height: .9rem; margin-top: .2rem; border: 1px solid #17202a; }
        .choice-text { min-width: 0; }
        .answer-lines { display: grid; gap: 1.5rem; margin-top: 1.5rem; }
        .answer-lines span { display: block; border-bottom: 1px solid #9aa4ae; }
        footer { margin-top: 3rem; color: #687480; font-size: .8rem; }
        @media print { body { max-width: none; margin: 0; padding: 0; } .question { break-inside: avoid-page; } }
    </style>
    ${stylesheet ? `<style>${stylesheet}</style>` : ''}
</head>
<body>
    <header>
        <h1>${escapeHtml(assessment.title)}</h1>
        ${assessment.instructions ? `<p class="instructions">${paragraphs(assessment.instructions)}</p>` : ''}
    </header>
    ${
        kind === 'student'
            ? `<div class="student-fields"><label>${escapeHtml(labels.studentName)}<span></span></label><label>${escapeHtml(labels.studentClass)}<span></span></label></div>`
            : ''
    }
    <main>${assessment.questions
        .map((question, index) =>
            questionHtml(question, index, kind, labels, assessment.locale, svg, answerKey),
        )
        .join('')}</main>
    <footer>${escapeHtml(labels.generatedBy)}</footer>
</body>
</html>`;
};

export const safeAssessmentFilename = (title: string): string => {
    const safe = title
        .normalize('NFKD')
        .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
        .replaceAll(/^-+|-+$/g, '')
        .toLowerCase();
    return (safe || 'litterbox-assessment').slice(0, 80);
};

export type AssessmentImportFailureReason =
    | 'too-large'
    | 'unreadable'
    | 'invalid-json'
    | 'wrong-kind'
    | 'unsupported-schema'
    | 'wrong-project'
    | 'invalid-shape'
    | 'over-limit';

export type AssessmentImportResult =
    | { ok: true; title: string; instructions: string; questions: AssessmentExportQuestion[] }
    | { ok: false; reason: AssessmentImportFailureReason };

class ImportRejection extends Error {
    constructor(readonly reason: AssessmentImportFailureReason) {
        super(reason);
    }
}

const boundedText = (value: unknown, maxLength: number): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new ImportRejection('invalid-shape');
    if (value.length > maxLength) throw new ImportRejection('over-limit');
    return value;
};

const importedAnswers = (value: unknown, limits: AssessmentLimits): string[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new ImportRejection('invalid-shape');
    if (value.length > limits.maxOptions) throw new ImportRejection('over-limit');
    return value.map((option) => {
        if (typeof option !== 'string') throw new ImportRejection('invalid-shape');
        return boundedText(option, limits.maxOptionLength) ?? '';
    });
};

const importedEnum = <T extends string>(options: readonly T[], value: unknown): T | undefined => {
    if (value === undefined || value === null) return undefined;
    const known = member(options, value);
    if (known === undefined) throw new ImportRejection('invalid-shape');
    return known;
};

const importedQuestion = (
    value: unknown,
    bounds: AssessmentBounds,
    limits: AssessmentLimits,
): AssessmentExportQuestion | undefined => {
    if (!isObject(value)) return undefined;
    const id = boundedText(value.id, ASSESSMENT_SHORT_TEXT_LENGTH);
    const question = boundedText(value.question, limits.maxQuestionTextLength);
    const source = importedEnum(['generated', 'teacher'] as const, value.source);
    const questionType = importedEnum(QUIZ_QUESTION_TYPES, value.questionType);
    if (!id || question === undefined || !source || !questionType) return undefined;
    const options = importedAnswers(value.options, limits);
    const { expectedAnswers } = value;
    if (
        typeof expectedAnswers !== 'number' ||
        !Number.isSafeInteger(expectedAnswers) ||
        expectedAnswers < 1 ||
        expectedAnswers > Math.max(1, options.length)
    )
        return undefined;
    // A key the question cannot hold, or a count that disagrees with it, would otherwise be
    // silently rewritten when the draft is built.
    const correctAnswers = canonicalCorrectAnswers(
        questionType,
        options,
        importedAnswers(value.correctAnswers, limits),
    );
    if (!correctAnswers) return undefined;
    if (questionType === 'MULTIPLE_CHOICE') {
        if (correctAnswers.length > 0 && correctAnswers.length !== expectedAnswers)
            return undefined;
    } else if (source === 'teacher' && (options.length > 0 || expectedAnswers !== 1)) {
        return undefined;
    }
    return {
        id,
        sourceQuestionId: boundedText(value.sourceQuestionId, ASSESSMENT_SHORT_TEXT_LENGTH),
        source,
        question,
        questionType,
        options,
        correctAnswers,
        expectedAnswers,
        answerGuide: boundedText(value.answerGuide, limits.maxAnswerGuideLength),
        hint: boundedText(value.hint, bounds.longText),
        sprite: boundedText(value.sprite, ASSESSMENT_SHORT_TEXT_LENGTH),
        scratchBlocks: boundedText(value.scratchBlocks, bounds.longText),
        programDimension: importedEnum(PROGRAM_DIMENSIONS, value.programDimension),
        scopeOfFocus: importedEnum(SCOPES_OF_FOCUS, value.scopeOfFocus),
    };
};

const importedAssessment = (
    parsed: Record<string, unknown>,
    bounds: AssessmentBounds,
    limits: AssessmentLimits,
): AssessmentImportResult => {
    const title = boundedText(parsed.title, limits.maxTitleLength);
    const instructions = boundedText(parsed.instructions, limits.maxInstructionsLength);
    if (
        title === undefined ||
        instructions === undefined ||
        !Array.isArray(parsed.questions) ||
        parsed.questions.length === 0
    ) {
        return { ok: false, reason: 'invalid-shape' };
    }
    if (parsed.questions.length > limits.maxQuestions) {
        return { ok: false, reason: 'over-limit' };
    }
    const questions: AssessmentExportQuestion[] = [];
    for (const candidate of parsed.questions) {
        const question = importedQuestion(candidate, bounds, limits);
        if (!question) return { ok: false, reason: 'invalid-shape' };
        if (
            questions.some(
                (existing) =>
                    existing.id === question.id ||
                    (question.source === 'generated' &&
                        question.sourceQuestionId &&
                        existing.source === 'generated' &&
                        existing.sourceQuestionId === question.sourceQuestionId),
            )
        )
            return { ok: false, reason: 'invalid-shape' };
        questions.push(question);
    }
    return { ok: true, title, instructions, questions };
};

export const parseAssessmentImport = (
    text: string,
    limits: AssessmentLimits,
    projectName?: string,
): AssessmentImportResult => {
    const bounds = assessmentBounds(limits);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, reason: 'invalid-json' };
    }
    if (!isObject(parsed) || parsed.kind !== 'litterbox-assessment') {
        return { ok: false, reason: 'wrong-kind' };
    }
    if (parsed.schemaVersion !== 1) {
        return { ok: false, reason: 'unsupported-schema' };
    }
    if (
        projectName !== undefined &&
        (!isObject(parsed.source) || parsed.source.project !== projectName)
    ) {
        return { ok: false, reason: 'wrong-project' };
    }
    try {
        return importedAssessment(parsed, bounds, limits);
    } catch (error) {
        if (error instanceof ImportRejection) return { ok: false, reason: error.reason };
        throw error;
    }
};
