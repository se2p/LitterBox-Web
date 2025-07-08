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

import java.util.Locale;
import java.util.Set;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.shared.LitterBoxAnalysisService;
import de.uni_passau.fim.se2.litterbox_web.shared.dto.IssueDTO;

@RestController
@RequestMapping("/linter")
public class LinterController {

    private final LitterBoxAnalysisService litterBoxAnalysisService;

    public LinterController(final LitterBoxAnalysisService litterBoxAnalysisService) {
        this.litterBoxAnalysisService = litterBoxAnalysisService;
    }

    /**
     * Analyses the program from the request and returns the generated feedback
     *
     * @param request the API request converted to {@link LinterRequest}.
     * @return feedback for the submitted program as string.
     */
    @PostMapping("analyze")
    public Set<IssueDTO> generateFeedback(@RequestBody final LinterRequest request) {
        final Locale language = request.languageAsLocale();
        return litterBoxAnalysisService.getIssues(request.program(), language, request.detectors());
    }
}
