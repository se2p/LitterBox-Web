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

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.analytics.ProgramBugAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.Script;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.Metadata;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.block.TopNonDataBlockMetadata;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;

@Service
public class LinterService {

    private static final Scratch3Parser PARSER = new Scratch3Parser();
    private static final Logger log = LoggerFactory.getLogger(IssueTool.class);

    public List<IssueInfo> getIssues(File file) throws ParsingException, IOException {
        final Program program = PARSER.parseSB3File(file);
        ProgramBugAnalyzer bugAnalyzer = new ProgramBugAnalyzer("all", false);
        Set<Issue> issues = bugAnalyzer.analyze(program);

        List<IssueInfo> issueList = new ArrayList<>();

        for (Issue issue : issues) {
            String parsedIssueHint = parseIssueHint(issue.getHint());

            String blockId = extractBlockId(issue);

            IssueInfo issueInfo = new IssueInfo(
                blockId, issue.getIssueType().toString(), issue.getFinderName(), parsedIssueHint
            );

            issueList.add(issueInfo);
        }

        return issueList;
    }

    private String parseIssueHint(String originalIssueHint) {
        return originalIssueHint.replaceAll("\\[.*?]", "").replaceAll("Problem:", "").trim();
    }

    private String extractBlockId(Issue issue) {
        String blockId = " ";
        try {
            if (issue != null && issue.getScript() != null) {
                Script script = issue.getScript();

                if (script.getEvent() != null) {
                    Metadata headBlockMetadata = script.getEvent().getMetadata();

                    if (headBlockMetadata instanceof TopNonDataBlockMetadata) {
                        blockId = ((TopNonDataBlockMetadata) headBlockMetadata).getBlockId();
                    }
                }
            }
        }
        catch (NullPointerException npe) {
            // Log the NullPointerException or handle it as needed
            // Todo: For now, just log the exception and proceed with the default value
            log.warn("NullPointerException in extractBlockId.", npe);
        }
        catch (Exception e) {
            // Log other exceptions or handle them as needed
            // Todo: For now, just log the exception and proceed with the default value
            log.warn("Exception in extractBlockId.", e);
        }

        return blockId;
    }
}
