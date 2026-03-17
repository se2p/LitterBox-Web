/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared;

import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.resources.ImageMetadata;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox.export.scratchblocks.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;

@Service
public class LitterBoxAnalysisService {

    /**
     * Analyses the Scratch program using LitterBox.
     *
     * @param program   A Scratch program.
     * @param locale    Language/locale used for analysis
     * @param detectors Programm analyzer detectors for filtering found issues.
     * @return The found LitterBox issues.
     */
    public Set<IssueDTO> getIssues(final Program program, final Locale locale, final String detectors) {
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(locale);

        return getLitterBoxIssues(program, detectors).stream()
            .map(issue -> convertIssue(translator, issue))
            .collect(Collectors.toSet());
    }

    private Set<Issue> getLitterBoxIssues(final Program program, final String detectors) {
        ProgramBugAnalyzer bugAnalyzer = new ProgramBugAnalyzer(detectors, false);
        return bugAnalyzer.analyze(program);
    }

    private IssueDTO convertIssue(final IssueTranslator translator, final Issue issue) {
        return new IssueDTO(
            issue.getId(),
            issue.getIssueType(),
            issue.getFinderName(),
            issue.getTranslatedFinderName(translator),
            issue.getHintText(translator),
            issue.getActorName(),
            getScriptId(issue),
            getBlockId(issue),
            getCostume(issue),
            getScratchBlocksCode(issue)
        );
    }

    private String getCostume(final Issue issue) {
        return issue.getActor().getActorMetadata().getCostumes().getList()
            .stream()
            .map(ImageMetadata::getAssetId)
            .findFirst()
            .orElse(null);
    }

    private String getBlockId(final Issue issue) {
        if (issue.getCodeLocation() != null) {
            return AstNodeUtil.getBlockId(issue.getCodeLocation());
        }
        else {
            return null;
        }
    }

    private String getScriptId(final Issue issue) {
        if (issue.getScript() != null) {
            return AstNodeUtil.getBlockId(issue.getScript());
        }
        else {
            return null;
        }
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
