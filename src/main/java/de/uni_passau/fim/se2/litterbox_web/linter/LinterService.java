/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.linter;

import java.util.ArrayList;
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
    public synchronized List<IssueInfo> getIssues(final Program program, String locale, String detectors) {
        // synchronized method: we are mutating global state in the singleton here
        IssueTranslator.getInstance().setLanguage(locale);
        ProgramBugAnalyzer bugAnalyzer = new ProgramBugAnalyzer(detectors, false);
        Set<Issue> issues = bugAnalyzer.analyze(program);

        List<IssueInfo> issueList = new ArrayList<>();
        for (Issue issue : issues) {
            String blockId = null;
            if (issue.getCodeLocation() != null) {
                ASTNode location = issue.getCodeLocation();
                blockId = AstNodeUtil.getBlockId(location);
            }

            String issueHint = issue.getHint();

            // Extract id of hat block if the detected flaw can be located within a script.
            String hatBlockId = "";
            if (issue.getScript() != null) {
                Metadata headBlockMetadata = issue.getScript().getEvent().getMetadata();
                if (headBlockMetadata instanceof TopNonDataBlockMetadata) {
                    hatBlockId = ((TopNonDataBlockMetadata) headBlockMetadata).getBlockId();
                }
            }

            IssueInfo issueInfo = new IssueInfo(
                blockId, issue.getIssueType().toString(), issue.getFinderName(), issue.getTranslatedFinderName(),
                issueHint, hatBlockId
            );

            issueList.add(issueInfo);
        }

        return issueList;
    }

}
