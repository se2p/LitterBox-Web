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
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import de.uni_passau.fim.se2.litterbox.report.IssueDTO;
import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import tools.jackson.databind.json.JsonMapper;

/**
 * What a stored analysis looks like to a reader.
 *
 * Everything here turns rows and stored JSON into the shapes the API hands out, and nothing here decides anything:
 * given the same analysis it produces the same view.
 */
class SingleProjectReportMapper {

    private static final String WEB_API_BASE_PATH = "/litterbox/api/v1";

    private final PatternCatalogueService catalogueService = new PatternCatalogueService();
    private final JsonMapper mapper = JsonMapper.shared();

    StoredAnalysis storedAnalysis(final Analysis analysis) {
        return analysis.reportJson() == null
            ? StoredAnalysis.empty()
            : mapper.readValue(analysis.reportJson(), StoredAnalysis.class);
    }

    StoredIssue issue(final IssueDTO issue, final Map<String, String> thumbnailHashes) {
        final List<String> costumes = issue.costumes() == null ? List.of() : issue.costumes();
        final String costume = issue.currentCostume() >= 0 && issue.currentCostume() < costumes.size()
            ? costumes.get(issue.currentCostume())
            : null;
        final List<SingleProjectDtos.SimilarIssueView> similar = issue.similarTo() == null
            ? List.of()
            : issue.similarTo().stream()
                .map(value -> new SingleProjectDtos.SimilarIssueView(value.id(), value.distance()))
                .toList();
        return new StoredIssue(
            issue.id(), issue.finder(), issue.name(), issue.type().name().toLowerCase(Locale.ROOT), issue.hint(),
            issue.sprite(), issue.issueLocationBlockId(), costume, issue.scratchBlocksCode(),
            issue.duplicateOf() == null ? List.of() : issue.duplicateOf().stream().sorted().toList(),
            issue.subsumedBy() == null ? List.of() : issue.subsumedBy().stream().sorted().toList(),
            issue.coupledTo() == null ? List.of() : issue.coupledTo().stream().sorted().toList(),
            issue.severity(), costumes, issue.currentCostume(), issue.refactoringScratchBlocksCode(), similar,
            issue.sprite() == null ? null : thumbnailHashes.get(issue.sprite())
        );
    }

    List<SingleProjectDtos.RelationshipView> relationships(final List<IssueDTO> issues) {
        return issues.stream().flatMap(this::relationshipsForIssue).sorted(
            java.util.Comparator.comparingInt(SingleProjectDtos.RelationshipView::source)
                .thenComparingInt(SingleProjectDtos.RelationshipView::target)
                .thenComparing(SingleProjectDtos.RelationshipView::type)
        ).toList();
    }

    private java.util.stream.Stream<SingleProjectDtos.RelationshipView> relationshipsForIssue(
        final IssueDTO issue
    ) {
        final java.util.stream.Stream<SingleProjectDtos.RelationshipView> duplicates = ids(
            issue.id(), issue.duplicateOf(), "duplicate"
        );
        final java.util.stream.Stream<SingleProjectDtos.RelationshipView> subsumption = ids(
            issue.id(), issue.subsumedBy(), "subsumption"
        );
        final java.util.stream.Stream<SingleProjectDtos.RelationshipView> coupling = ids(
            issue.id(), issue.coupledTo(), "coupling"
        );
        final java.util.stream.Stream<SingleProjectDtos.RelationshipView> similarity = issue.similarTo() == null
            ? java.util.stream.Stream.empty()
            : issue.similarTo().stream().map(
                similar -> new SingleProjectDtos.RelationshipView(issue.id(), similar.id(), "similarity")
            );
        return java.util.stream.Stream.of(duplicates, subsumption, coupling, similarity).flatMap(stream -> stream);
    }

    java.util.stream.Stream<SingleProjectDtos.RelationshipView> ids(
        final int source, final Set<Integer> targets, final String type
    ) {
        return targets == null
            ? java.util.stream.Stream.empty()
            : targets.stream().sorted().map(target -> new SingleProjectDtos.RelationshipView(source, target, type));
    }

    List<SingleProjectDtos.CatalogueView> catalogue(
        final Locale locale, final List<IssueDTO> issues
    ) {
        return issues.stream()
            .map(IssueDTO::finder)
            .distinct()
            .sorted()
            .map(finderId -> catalogueService.entry(finderId, locale))
            .map(SingleProjectDtos.CatalogueView::from)
            .toList();
    }

    SingleProjectDtos.IssueView issueView(
        final StoredIssue issue,
        final String submissionToken,
        final Set<String> authorizedAssetHashes
    ) {
        final String thumbnailRef = issue.thumbnailHash() != null
            && authorizedAssetHashes.contains(issue.thumbnailHash())
                ? WEB_API_BASE_PATH + "/submissions/" + submissionToken + "/assets/" + issue.thumbnailHash()
                : null;
        return new SingleProjectDtos.IssueView(
            issue.id(), issue.finderId(), issue.finderName(), issue.type(), issue.hint(), issue.sprite(),
            issue.blockId(),
            issue.costume(), issue.scratchblocks(), issue.duplicates(), issue.subsumedBy(), issue.coupledWith(),
            issue.severity(), issue.costumes(), issue.currentCostume(), issue.refactoringScratchblocks(),
            issue.similarTo(), thumbnailRef
        );
    }

    SingleProjectDtos.SubmissionView view(
        final Submission submission, final List<Analysis> analysesForSubmission, final Map<Long, String> names
    ) {
        if (analysesForSubmission.isEmpty()) {
            return new SingleProjectDtos.SubmissionView(
                SingleProjectDtos.SCHEMA_VERSION, submission.id(), submission.shareToken(),
                SingleProjectSupport.status(submission.state()), submission.locale(), null, submission.sourceType(),
                submission.expectedCount(), submission.completedCount(), submission.failedCount(), List.of(),
                new SingleProjectDtos.Counts(
                    submission.expectedCount(), submission.completedCount(), submission.failedCount()
                )
            );
        }
        final List<SingleProjectDtos.AnalysisView> analysisViews = analysesForSubmission.stream()
            .map(analysis -> analysisView(submission, analysis, names.get(analysis.id()))).toList();
        final SingleProjectDtos.AnalysisView singular = analysisViews.getLast();
        return new SingleProjectDtos.SubmissionView(
            SingleProjectDtos.SCHEMA_VERSION, submission.id(), submission.shareToken(),
            SingleProjectSupport.status(submission.state()),
            submission.locale(), singular, submission.sourceType(), submission.expectedCount(),
            submission.completedCount(),
            submission.failedCount(), analysisViews,
            new SingleProjectDtos.Counts(
                submission.expectedCount(), submission.completedCount(), submission.failedCount()
            )
        );
    }

    SingleProjectDtos.AnalysisView analysisView(
        final Submission submission, final Analysis analysis, final String name
    ) {
        final StoredAnalysis report = storedAnalysis(analysis);
        final Set<String> authorizedAssetHashes = Set.copyOf(report.assetHashes());
        final List<SingleProjectDtos.IssueView> issues = report.issues().stream()
            .map(issue -> issueView(issue, submission.shareToken(), authorizedAssetHashes)).toList();
        final List<String> detectors = analysis.detectorSet() == null
            ? List.of()
            : List.of(analysis.detectorSet());
        final Map<String, Double> metrics = analysis.metrics().isEmpty() ? report.metrics() : analysis.metrics();
        return new SingleProjectDtos.AnalysisView(
            analysis.id(), SingleProjectSupport.status(analysis.status()),
            name,
            analysis.failureType(), analysis.failureMessage(), analysis.reportSchemaVersion(),
            analysis.litterboxArtifactVersion(), analysis.locale(), analysis.provenance(), detectors,
            configuration(analysis.configurationJson()), analysis.inputSha256() == null
                ? null
                : HexFormat.of().formatHex(analysis.inputSha256()),
            analysis.inputFormat(),
            metrics, issues, report.relationships(), report.catalogue(), report.quiz(),
            report.assetHashes().stream().map(
                hash -> WEB_API_BASE_PATH + "/submissions/" + submission.shareToken() + "/assets/" + hash
            ).toList()
        );
    }

    Map<String, String> configuration(final String configurationJson) {
        if (configurationJson == null) {
            return Map.of();
        }
        final AnalysisConfiguration configuration = mapper.readValue(
            configurationJson, AnalysisConfiguration.class
        );
        final Map<String, String> values = new LinkedHashMap<>();
        addConfiguration(values, "detectors", configuration.detectors());
        addConfiguration(values, "reportOptions", configuration.reportOptions());
        addConfiguration(values, "qlc", configuration.qlc());
        return Map.copyOf(values);
    }

    void addConfiguration(
        final Map<String, String> values,
        final String key,
        final String value
    ) {
        if (value != null && !value.isBlank()) {
            values.put(key, value);
        }
    }

    SingleProjectDtos.CreatedSubmission toCreated(
        final SingleProjectSubmissionService.CreatedSubmission created
    ) {
        return toCreated(created.submission());
    }

    SingleProjectDtos.CreatedSubmission toCreated(final Submission submission) {
        return new SingleProjectDtos.CreatedSubmission(
            submission.id(), submission.shareToken(), SingleProjectSupport.status(submission.state()),
            URI.create(WEB_API_BASE_PATH + "/submissions/" + submission.shareToken())
        );
    }

    /** The three things an analysis records about how it was run, as they are stored against it. */
    private record AnalysisConfiguration(String detectors, String reportOptions, String qlc) {
    }
}
