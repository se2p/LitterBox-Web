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

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller for the handling code analysis requests from the tutorial system
 */
@RestController
@RequestMapping("tutorial-system")
public class TutorialSystemController {

    private final ProgramAnalyzerService programAnalyzerService;

    public TutorialSystemController(ProgramAnalyzerService programAnalyzerService) {
        this.programAnalyzerService = programAnalyzerService;
    }

    /**
     * Analyses the program from the request and returns the generated feedback
     *
     * @param request the API request converted to {@link TutorialRequest}.
     * @return feedback for the submitted program as string.
     */
    @PostMapping("generate-feedback")
    public List<TutorialIssueInfo> generateFeedback(@RequestBody final TutorialRequest request) {
        Locale language = request.languageAsLocale();
        return programAnalyzerService.checkProgram(request.program(), language, request.detectors());
    }
}
