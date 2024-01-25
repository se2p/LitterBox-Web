/*
 * Copyright (C) 2023 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
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
package de.uni_passau.fim.se2.litterbox_web.rest.linter.linter;

import de.uni_passau.fim.se2.litterbox.analytics.BugAnalyzer;
import de.uni_passau.fim.se2.litterbox.analytics.Issue;
import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.model.Script;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.Metadata;
import de.uni_passau.fim.se2.litterbox.ast.model.metadata.block.TopNonDataBlockMetadata;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
public class linterService {
    private static final Scratch3Parser PARSER = new Scratch3Parser();
    private static final Logger log = Logger.getLogger(IssueTool.class.getName());


    public List<IssueInfo> getIssues(File file) throws ParsingException, IOException {
        try {
            final Program program = PARSER.parseSB3File(file);
            BugAnalyzer bugAnalyzer = new BugAnalyzer(
                    null,
                    null,
                    "all",
                    false, false, true);

            Set<Issue> issues = bugAnalyzer.check(program);

            List<IssueInfo> issueList = new ArrayList<>();

            for (Issue issue : issues) {
                String parsedIssueHint = parseIssueHint(issue.getHint());

                String blockId = extractblockId(issue);

                IssueInfo issueInfo = new IssueInfo(
                        blockId,  issue.getIssueType().toString(),issue.getFinderName(), parsedIssueHint);

                issueList.add(issueInfo);
            }

            return issueList;
        } catch (Exception e) {
            throw new IssueGenerationException(e.getMessage(), e);
        }
    }

    private String parseIssueHint(String originalIssueHint) {
        return originalIssueHint.replaceAll("\\[.*?]", "").replaceAll("Problem:", "").trim();
    }

    private String extractblockId(Issue issue) {
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
        } catch (NullPointerException npe) {
            // Log the NullPointerException or handle it as needed
            // For now, just log the exception and proceed with the default value
            log.log(Level.FINE,"NullPointerException in extractBlockId:");
        } catch (Exception e) {
            // Log other exceptions or handle them as needed
            // For now, just log the exception and proceed with the default value
            log.log(Level.FINE,"Exception in extractBlockId: " );
        }

        return blockId;
    }
}
class IssueGenerationException extends ResponseStatusException {

    IssueGenerationException(final String message, final Throwable cause) {
        super(HttpStatus.INTERNAL_SERVER_ERROR, message, cause);
    }
}
