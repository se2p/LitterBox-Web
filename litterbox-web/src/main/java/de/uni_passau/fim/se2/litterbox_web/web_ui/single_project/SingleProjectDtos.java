/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.jspecify.annotations.Nullable;

import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.PatternCatalogueEntry;

public final class SingleProjectDtos {

    public static final int SCHEMA_VERSION = 1;

    private SingleProjectDtos() {
    }

    public record CreatedSubmission(long submissionId, String token, String status, URI location) {
    }

    public record QuestionProjectUrlRequest(String projectUrl) {
    }

    /**
     * A studio as it describes itself, read before anything is submitted.
     *
     * @param projects how many projects the studio holds, or {@code null} when it cannot be read or is larger than a
     *                 single listing page can measure
     */
    public record StudioSummaryView(String studioId, String title, boolean readable, Integer projects) {
    }

    /** Which analysis to run over a project this service already holds: {@code issues} or {@code questions}. */
    public record ReuseRequest(String analysis) {
    }

    public record SubmissionView(
        int schemaVersion,
        long submissionId,
        String token,
        String status,
        String locale,
        AnalysisView analysis,
        String sourceType,
        int expectedCount,
        int completedCount,
        int failedCount,
        List<AnalysisView> analyses,
        Counts counts
    ) {

        public SubmissionView {
            analyses = List.copyOf(analyses);
        }
    }

    public record Counts(int expected, int completed, int failed) {
    }

    public record AnalysisView(
        long id,
        String status,
        String name,
        String failureType,
        String failureMessage,
        String reportSchemaVersion,
        String litterboxVersion,
        String locale,
        String provenance,
        List<String> detectors,
        Map<String, String> configuration,
        String sourceSha256,
        String inputFormat,
        Map<String, Double> metrics,
        List<IssueView> issues,
        List<RelationshipView> relationships,
        List<CatalogueView> catalogue,
        List<QuizView> quiz,
        List<String> assetRefs
    ) {

        public AnalysisView {
            detectors = List.copyOf(detectors);
            configuration = Map.copyOf(configuration);
            metrics = Map.copyOf(metrics);
            issues = List.copyOf(issues);
            relationships = List.copyOf(relationships);
            catalogue = List.copyOf(catalogue);
            quiz = List.copyOf(quiz);
            assetRefs = List.copyOf(assetRefs);
        }

        public AnalysisView(
            final long id,
            final String status,
            final String name,
            final String failureType,
            final String failureMessage,
            final List<IssueView> issues,
            final List<RelationshipView> relationships,
            final List<CatalogueView> catalogue,
            final List<QuizView> quiz,
            final List<String> assetRefs
        ) {
            this(
                id, status, name, failureType, failureMessage, null, null, null, null,
                List.of(), Map.of(), null, null, Map.of(), issues, relationships, catalogue, quiz, assetRefs
            );
        }
    }

    /** A comprehension question shown to a learner without its answer key. */
    public record QuizView(
        String questionId,
        String question,
        List<String> options,
        @Nullable String questionType,
        @Nullable String sprite,
        @Nullable String scratchBlocks,
        @Nullable String hint,
        @Nullable String programDimension,
        @Nullable String scopeOfFocus,
        @Nullable Integer expectedAnswers
    ) {

        public QuizView {
            options = List.copyOf(options);
        }
    }

    /** The verdict on one submitted answer. The expected answer is only disclosed once the reader has answered. */
    public record QuizAnswerResult(String questionId, boolean correct, List<String> correctAnswers) {

        public QuizAnswerResult {
            correctAnswers = List.copyOf(correctAnswers);
        }
    }

    /**
     * The correct answer(s) to every generated question of a completed analysis, gathered for whoever already holds the
     * submission token that owns it - the same authority that can already read the project back whole, export its code,
     * or have faults injected into it. Unlike {@link QuizAnswerResult}, which only discloses an answer once a reader
     * has offered one of their own, this is handed over on request alone, for building a marking key ahead of time
     * rather than after the fact.
     */
    public record QuizAnswerKeyView(int schemaVersion, List<QuizAnswerKeyQuestion> questions) {

        public QuizAnswerKeyView {
            questions = List.copyOf(questions);
        }
    }

    public record QuizAnswerKeyQuestion(String questionId, List<String> correctAnswers) {

        public QuizAnswerKeyQuestion {
            correctAnswers = List.copyOf(correctAnswers);
        }
    }

    public record AssetContent(String mediaType, long byteSize, byte[] content) {

        public AssetContent {
            content = content.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }

    public record RelationshipView(int source, int target, String type) {
    }

    public record CatalogueView(
        String id,
        String title,
        String description,
        String locale,
        boolean fallback,
        String instruction,
        List<WorkedExampleView> examples,
        String issueType,
        /* Broad editor compatibility retained for existing clients: "scratch" or "mblock". */
        String platform,
        /* Which block ecosystem the finder specifically analyses: "scratch", "qscratch", or "mblock". */
        String blockSet
    ) {

        public CatalogueView {
            examples = List.copyOf(examples);
        }

        /**
         * Converts an internal catalogue entry to the public response shape.
         *
         * @param entry the internal catalogue entry
         * @return the catalogue entry exposed to the web UI
         */
        public static CatalogueView from(final PatternCatalogueEntry entry) {
            return new CatalogueView(
                entry.finderId(), entry.name(), entry.hint(), entry.locale(), entry.fallback(),
                entry.instruction(), entry.examples().stream()
                    .map(example -> new WorkedExampleView(example.label(), example.scratchblocks()))
                    .toList(),
                entry.issueType().name().toLowerCase(Locale.ROOT),
                FinderPlatform.of(entry.blockSet()).wireName(), entry.blockSet().wireName()
            );
        }
    }

    public record WorkedExampleView(String label, String scratchblocks) {
    }

    public record IssueView(
        int id,
        String finderId,
        String finderName,
        String type,
        String hint,
        String sprite,
        String blockId,
        String costume,
        String scratchblocks,
        List<Integer> duplicates,
        List<Integer> subsumedBy,
        List<Integer> coupledWith,
        int severity,
        List<String> costumes,
        int currentCostume,
        String refactoringScratchblocks,
        List<SimilarIssueView> similarTo,
        @Nullable String thumbnailRef
    ) {

        public IssueView {
            duplicates = List.copyOf(duplicates);
            subsumedBy = List.copyOf(subsumedBy);
            coupledWith = List.copyOf(coupledWith);
            costumes = List.copyOf(costumes);
            similarTo = List.copyOf(similarTo);
        }

        public IssueView(
            final int id,
            final String finderId,
            final String finderName,
            final String type,
            final String hint,
            final String sprite,
            final String blockId,
            final String costume,
            final String scratchblocks,
            final List<Integer> duplicates,
            final List<Integer> subsumedBy,
            final List<Integer> coupledWith
        ) {
            this(
                id, finderId, finderName, type, hint, sprite, blockId, costume, scratchblocks,
                duplicates, subsumedBy, coupledWith, 0, List.of(), 0, null, List.of(), null
            );
        }
    }

    public record SimilarIssueView(int id, double distance) {
    }

    public record FeedbackRequest(String finderId, String reaction) {
    }

    public record QuizAnswerRequest(String questionId, String answer) {

        /** Compatibility constructor for callers compiled against the earlier request shape. */
        @Deprecated(forRemoval = true)
        public QuizAnswerRequest(
            final String questionId,
            final String answer,
            final boolean ignoredCorrect
        ) {
            this(questionId, answer);
        }

    }

    public record RecordedWrite(long analysisId, Instant recordedAt) {
    }
}
