// SPDX-License-Identifier: EUPL-1.2
// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
// Generated from the frozen /api/v1 contract.

export interface CapabilitiesDto {
    schemaVersion: number;
    litterboxVersion: string;
    supportedLocales: string[];
    enabledFeatures: string[];
    assessmentLimits?: AssessmentLimitsDto;
}

export interface AssessmentLimitsDto {
    maxQuestions: number;
    maxTitleLength: number;
    maxInstructionsLength: number;
    maxQuestionTextLength: number;
    maxAnswerGuideLength: number;
    maxOptions: number;
    maxOptionLength: number;
    maxAnswerLength: number;
}

export interface MetricBandDto {
    name: string;
    sampleSize: number;
    lowerBound: number;
    upperBound: number;
    minimum?: number;
    q1?: number;
    median?: number;
    q3?: number;
    maximum?: number;
}

export interface MetricReferenceDto {
    metrics: MetricBandDto[];
}

export interface PublicStatisticsTotalsDto {
    projects: number;
    blocks: number;
    scripts: number;
    sprites: number;
}

export interface PublicStatisticsCurvePointDto {
    value: number;
    relativeDensity: number;
}

export interface PublicStatisticsDistributionDto {
    metric: string;
    sampleSize: number;
    minimum: number;
    p25: number;
    median: number;
    p75: number;
    p95: number;
    displayMaximum: number;
    zeroCount: number;
    zeroPrevalence: number;
    points: PublicStatisticsCurvePointDto[];
}

export interface PublicStatisticsFindingDto {
    finderId: string;
    name: string;
    projectsAffected: number;
    occurrences: number;
    prevalence: number;
}

export interface PublicStatisticsFindingGroupDto {
    type: string;
    findings: PublicStatisticsFindingDto[];
}

export interface PublicStatisticsBlockCategoryDto {
    metric: string;
    projectsUsing: number;
    prevalence: number;
    blocks: number;
    blockShare: number;
}

export interface PublicStatisticsDto {
    schemaVersion: number;
    available: boolean;
    generatedAt: string;
    totals: PublicStatisticsTotalsDto | null;
    distributions: PublicStatisticsDistributionDto[];
    findingGroups: PublicStatisticsFindingGroupDto[];
    blockCategories: PublicStatisticsBlockCategoryDto[];
}

export interface CreatedSubmissionDto {
    submissionId: number;
    token: string;
    status: string;
    location: string;
}

export interface QuestionProjectUrlRequestDto {
    projectUrl: string;
}

export interface StudioSummaryViewDto {
    studioId: string;
    title: string | null;
    readable: boolean;
    /** Null when the studio cannot be read, or is larger than the service can measure in one request. */
    projects: number | null;
}

export interface SubmissionViewDto {
    schemaVersion: number;
    submissionId: number;
    token: string;
    status: string;
    locale: string;
    analysis: AnalysisViewDto | null;
    sourceType: string;
    expectedCount: number;
    completedCount: number;
    failedCount: number;
    analyses: AnalysisViewDto[];
    counts: SubmissionCountsDto;
}

export interface AnalysisViewDto {
    id: number;
    status: string;
    name: string | null;
    failureType: string | null;
    failureMessage: string | null;
    reportSchemaVersion: string | null;
    litterboxVersion: string | null;
    locale: string | null;
    provenance: string | null;
    detectors: string[];
    configuration: Record<string, string>;
    sourceSha256: string | null;
    inputFormat: string | null;
    metrics: Record<string, number>;
    issues: IssueViewDto[];
    relationships: RelationshipViewDto[];
    catalogue: CatalogueViewDto[];
    quiz: QuizViewDto[];
    assetRefs: string[];
}

export interface SubmissionCountsDto {
    expected: number;
    completed: number;
    failed: number;
}

export interface QuizViewDto {
    questionId: string;
    question: string;
    options: string[];
    questionType?: string | null;
    sprite?: string | null;
    scratchBlocks?: string | null;
    hint?: string | null;
    programDimension?: string | null;
    scopeOfFocus?: string | null;
    expectedAnswers?: number;
}

export interface IssueViewDto {
    id: number;
    finderId: string;
    finderName: string;
    type: string;
    hint: string;
    sprite: string;
    blockId: string | null;
    costume: string | null;
    scratchblocks: string;
    duplicates: number[];
    subsumedBy: number[];
    coupledWith: number[];
    severity: number;
    costumes: string[];
    currentCostume: number;
    refactoringScratchblocks: string | null;
    similarTo: SimilarIssueViewDto[];
    thumbnailRef: string | null;
}

export interface SimilarIssueViewDto {
    id: number;
    distance: number;
}

export interface RelationshipViewDto {
    source: number;
    target: number;
    type: string;
}

export interface CatalogueViewDto {
    id: string;
    title: string;
    description: string;
    locale: string;
    fallback: boolean;
    instruction: string;
    examples: WorkedExampleViewDto[];
    issueType: string;
    /** Which editor the pattern applies to: "scratch" or "mblock". Absent from deployments predating the split. */
    platform?: string;
    /** Which block ecosystem the pattern applies to: "scratch", "qscratch", or "mblock". */
    blockSet?: string;
}

export interface WorkedExampleViewDto {
    label: string;
    scratchblocks: string;
}

export interface FeedbackRequestDto {
    finderId: string;
    reaction: string;
}

export interface QuizAnswerRequestDto {
    questionId: string;
    answer: string;
}

export interface QuizAnswerResultDto {
    questionId: string;
    correct: boolean;
    correctAnswers: string[];
}

export interface AnalysisReferenceDto {
    submissionToken: string;
    analysisId: number;
}

export interface SourceViewDto {
    analysisId: number;
    name: string;
}

export interface DiffRequestDto {
    before: AnalysisReferenceDto;
    after: AnalysisReferenceDto;
}

export interface DiffCountsDto {
    beforeTotal: number;
    afterTotal: number;
    fixed: number;
    newIssues: number;
    persisting: number;
    removed: number;
}

export interface DiffIssueViewDto {
    finderId: string;
    finderName: string;
    issueType: string;
    severity: number;
    sprite: string;
    blockId: string | null;
    scratchblocks: string;
}

export interface ScriptDiffViewDto {
    changeType: string;
    beforeScratchblocks: string | null;
    afterScratchblocks: string | null;
    annotatedBeforeScratchblocks: string | null;
    annotatedAfterScratchblocks: string | null;
}

export interface ActorDiffViewDto {
    actorName: string;
    stage: boolean;
    scripts: ScriptDiffViewDto[];
}

export interface DiffViewDto {
    schemaVersion: number;
    before: SourceViewDto;
    after: SourceViewDto;
    counts: DiffCountsDto;
    fixed: DiffIssueViewDto[];
    newIssues: DiffIssueViewDto[];
    persisting: DiffIssueViewDto[];
    removed: DiffIssueViewDto[];
    actors: ActorDiffViewDto[];
}

export type ExportFormatDto = 'scratchblocks' | 'goboscript' | 'pystage';
export type ExportTargetKindDto = 'program' | 'sprite' | 'script';

export interface ExportTargetDto {
    kind: ExportTargetKindDto;
    spriteName: string | null;
    scriptId: string | null;
}

export interface ExportRequestDto {
    format: ExportFormatDto;
    target: ExportTargetDto;
}

export interface ExportSpriteTargetViewDto {
    name: string;
    stage: boolean;
}

export interface ExportScriptTargetViewDto {
    scriptId: string;
    spriteName: string;
    ordinal: number;
    scratchblocks: string;
}

export interface ExportTargetsViewDto {
    sprites: ExportSpriteTargetViewDto[];
    scripts: ExportScriptTargetViewDto[];
}

export interface InjectorViewDto {
    injectorId: string;
    finderId: string;
    name: string;
    description: string;
}

export interface InjectorCatalogueViewDto {
    injectors: InjectorViewDto[];
    maxSelectedInjectors: number;
    allSelectionSupported: boolean;
}

export interface InjectionRequestDto {
    injectorIds: string[];
    all?: boolean;
}

export interface InjectionResultViewDto {
    injectorId: string;
    finderId: string;
    resultIndex: number;
    spriteName: string;
    originalScriptId: string;
    mutatedScriptId: string;
    originalScratchblocks: string;
    mutatedScratchblocks: string;
}

export interface InjectionFailureViewDto {
    injectorId: string;
    finderId: string;
    code: string;
}

export interface InjectionPreviewDto {
    schemaVersion: number;
    source: SourceViewDto;
    results: InjectionResultViewDto[];
    failures: InjectionFailureViewDto[];
}

export interface InjectionDownloadRequestDto {
    injectorId: string;
    resultIndex: number;
}
