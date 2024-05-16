/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.controller;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model.TutorialRequest;
import de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.service.ProgramAnalyzerService;

/**
 * Controller for the handling code analysis requests from the tutorial system
 */
@RestController
@RequestMapping("tutorial-system/checker")
public class Controller {

    private static final Logger log = LoggerFactory.getLogger(Controller.class);
    private final ProgramAnalyzerService programAnalyzerService;

    /**
     * Constructor of the Controller.
     *
     * @param programAnalyzerService instance of the ProgramAnalyzerService.
     */
    public Controller(ProgramAnalyzerService programAnalyzerService) {
        this.programAnalyzerService = programAnalyzerService;
    }

    /**
     * Analyses the program from the request and returns the generated feedback
     *
     * @param request the API request converted to {@link TutorialRequest}.
     * @return feedback for the submitted program as string.
     */
    @PostMapping("generate-feedback")
    public String generateFeedback(@RequestBody final TutorialRequest request) {
        log.debug("Received the following input: {}", request.toString());
        String program = request.programAsString();
        Locale language = request.languageAsLocale();
        String result = programAnalyzerService.checkProgram(program, language, request.detectors());
        log.debug("result: {}", result);
        String noFeedbackMsg = "{\"issues\": []}";
        if (result.isEmpty()) {
            return noFeedbackMsg;
        }
        return result;
    }
}
