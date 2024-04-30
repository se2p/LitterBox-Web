/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.linter;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.Metadata;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.block.TopNonDataBlockMetadata;
import de.uni_passau.fim.se2.litterbox.ast.util.AstNodeUtil;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;

@Service
public class LinterService {

    /**
     * Analyses the Scratch program using LitterBox.
     *
     * @param program   A Scratch program.
     * @param locale    Language/locale used for analysis
     * @param detectors Programm analyzer detectors for filtering found issues.
     * @return The found LitterBox issues.
     */
    public synchronized List<IssueInfo> getIssues(final Program program, final String locale, final String detectors) {
        // synchronized method: we are mutating global state in the singleton here
        // NOTE: convertToIssueInfo also uses the translator with `issue.getTranslatedFinderName()`. Therefore, we
        // cannot limit the synchronized block to only `getLitterBoxIssues()`.
        IssueTranslator.getInstance().setLanguage(locale);

        final Set<Issue> issues = getLitterBoxIssues(program, detectors);
        return issues.stream().map(this::convertToIssueInfo).toList();
    }

    private Set<Issue> getLitterBoxIssues(final Program program, final String detectors) {
        ProgramBugAnalyzer bugAnalyzer = new ProgramBugAnalyzer(detectors, false);
        return bugAnalyzer.analyze(program);
    }

    private IssueInfo convertToIssueInfo(final Issue issue) {
        String blockId = null;
        if (issue.getCodeLocation() != null) {
            ASTNode location = issue.getCodeLocation();
            blockId = AstNodeUtil.getBlockId(location);
        }

        // Extract id of hat block if the detected flaw can be located within a script.
        String hatBlockId = null;
        if (issue.getScript() != null) {
            Metadata headBlockMetadata = issue.getScript().getEvent().getMetadata();
            if (headBlockMetadata instanceof TopNonDataBlockMetadata nonDataBlockMetadata) {
                hatBlockId = nonDataBlockMetadata.getBlockId();
            }
        }

        String issueHint = issue.getHint();

        return new IssueInfo(
            blockId, issue.getIssueType().toString(), issue.getFinderName(), issue.getTranslatedFinderName(),
            issueHint, hatBlockId
        );
    }
}
