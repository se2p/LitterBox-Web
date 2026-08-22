/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.MultiBlockIssue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramMetricAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.ScriptEntity;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.resources.ImageMetadata;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox.export.scratchblocks.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox.report.IssueDTO;
import de.uni_passau.fim.se2.litterbox.report.ReportDTO;
import de.uni_passau.fim.se2.litterbox.report.SimilarIssueDTO;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;

/** Builds the structured report persisted by the web application. */
final class StructuredReportAssembler {

    ReportDTO create(
        final Program program,
        final Collection<Issue> issues,
        final IssueTranslator translator
    ) {
        final Map<String, Double> metrics = new TreeMap<>();
        final ProgramMetricAnalyzer tool = new ProgramMetricAnalyzer();
        tool.getAnalyzers().forEach(metric -> metrics.put(metric.getName(), metric.calculateMetric(program)));

        final List<Issue> orderedIssues = issues.stream()
            .sorted(Comparator.comparingInt(Issue::getId))
            .toList();
        final List<IssueDTO> issueDtos = orderedIssues.stream()
            .map(issue -> createIssue(orderedIssues, issue, translator))
            .toList();
        return new ReportDTO(Collections.unmodifiableMap(metrics), issueDtos);
    }

    private IssueDTO createIssue(
        final Collection<Issue> issues,
        final Issue issue,
        final IssueTranslator translator
    ) {
        final String location = issue.getCodeLocation() == null
            ? null
            : AstNodeUtil.getBlockId(issue.getCodeLocation());
        final List<String> costumes = issue.getActor().getActorMetadata().getCostumes().getList().stream()
            .map(ImageMetadata::getAssetId)
            .toList();
        final String code = issue instanceof MultiBlockIssue multi
            ? scratchBlocks(issue, multi.getScriptEntities())
            : scratchBlocks(issue, issue.getScriptOrProcedureDefinition());

        return new IssueDTO(
            issue.getId(),
            issue.getFinderName(),
            issue.getTranslatedFinderName(translator),
            issue.getIssueType(),
            issue.getSeverity().getSeverityLevel(),
            issue.getActorName(),
            location,
            relatedIds(issues, issue, issue::isDuplicateOf),
            relatedIds(issues, issue, issue::isSubsumedBy),
            relatedIds(issues, issue, issue::areCoupled),
            similarIssues(issues, issue),
            issue.getHintText(translator),
            costumes,
            issue.getActor().getActorMetadata().getCurrentCostume(),
            code,
            scratchBlocks(issue, issue.getRefactoredScriptOrProcedureDefinition())
        );
    }

    private Set<Integer> relatedIds(
        final Collection<Issue> issues,
        final Issue source,
        final Predicate<Issue> predicate
    ) {
        final Set<Integer> relatedIds = issues.stream()
            .filter(candidate -> candidate != source)
            .filter(predicate)
            .map(Issue::getId)
            .collect(Collectors.toCollection(TreeSet::new));
        return Collections.unmodifiableSet(relatedIds);
    }

    private List<SimilarIssueDTO> similarIssues(final Collection<Issue> issues, final Issue source) {
        return issues.stream()
            .filter(candidate -> candidate != source)
            .filter(candidate -> source.getFinder() == candidate.getFinder())
            .sorted(Comparator.comparingInt(source::getDistanceTo).thenComparingInt(Issue::getId))
            .map(candidate -> new SimilarIssueDTO(candidate.getId(), source.getDistanceTo(candidate)))
            .toList();
    }

    private String scratchBlocks(final Issue issue, final ScriptEntity location) {
        if (location == null) {
            return ScratchBlocksVisitor.SCRATCHBLOCKS_START + System.lineSeparator()
                + ScratchBlocksVisitor.SCRATCHBLOCKS_END + System.lineSeparator();
        }
        final ScratchBlocksVisitor visitor = new ScratchBlocksVisitor(issue);
        visitor.begin();
        location.accept(visitor);
        visitor.end();
        return visitor.getScratchBlocks();
    }

    private String scratchBlocks(final Issue issue, final List<ScriptEntity> locations) {
        return locations.stream().map(location -> scratchBlocks(issue, location)).collect(Collectors.joining(" "));
    }
}
