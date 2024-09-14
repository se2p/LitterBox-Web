/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system;

import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.resources.ImageMetadata;
import de.uni_passau.fim.se2.litterbox.ast.visitor.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;

/**
 * Used to analyze a SCRATCH program.
 */
@Service
public class ProgramAnalyzerService {

    private static final Logger log = LoggerFactory.getLogger(ProgramAnalyzerService.class);

    /**
     * Analyzes a SCRATCH program and returns the results.
     *
     * @param program   the program to be checked as String.
     * @param language  the language fot the output hints as Locale.
     * @param detectors String that contains all detectors
     * @return the results of analysis as String in the submitted language.
     */
    public synchronized List<TutorialIssueInfo> checkProgram(final Program program, Locale language, String detectors) {
        IssueTranslator.getInstance().setLanguage(language.getLanguage());

        final Set<Issue> issues = getLitterBoxIssues(program, detectors);
        log.debug("Found {} issues.", issues.size());

        return issues.stream().map(this::convertIssue).toList();
    }

    private Set<Issue> getLitterBoxIssues(final Program program, final String detectors) {
        ProgramBugAnalyzer bugAnalyzer = new ProgramBugAnalyzer(detectors, false);
        return bugAnalyzer.analyze(program);
    }

    private TutorialIssueInfo convertIssue(final Issue issue) {
        final String costume = issue.getActor().getActorMetadata().getCostumes().getList()
            .stream()
            .map(ImageMetadata::getAssetId)
            .findFirst()
            .orElse(null);

        final String scratchBlocksCode = getScratchBlocksCode(issue);

        return new TutorialIssueInfo(
            issue.getTranslatedFinderName(),
            issue.getHint(),
            issue.getActorName(),
            costume,
            issue.getIssueType(),
            scratchBlocksCode
        );
    }

    private String getScratchBlocksCode(final Issue issue) {
        final ASTNode location = issue.getScriptOrProcedureDefinition();
        if (location == null) {
            return "";
        }

        final ScratchBlocksVisitor blockVisitor = new ScratchBlocksVisitor(issue);
        location.accept(blockVisitor);

        return blockVisitor.getScratchBlocks();
    }
}
