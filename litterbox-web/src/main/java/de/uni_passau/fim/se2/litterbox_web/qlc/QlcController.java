/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.qlc;

import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/qlc")
public class QlcController {

    private final QlcService qlcService;
    private final AnalysisWork analysisWork;

    public QlcController(final QlcService qlcService, final AnalysisWork analysisWork) {
        this.qlcService = qlcService;
        this.analysisWork = analysisWork;
    }

    /**
     * Generates comprehension questions for the submitted Scratch program.
     *
     * @param request the API request.
     * @return the generated questions.
     */
    @PostMapping("generate")
    public Mono<List<QuestionDTO>> generateQuestions(@RequestBody final QlcRequest request) {
        return analysisWork.submit(() -> generate(request));
    }

    private List<QuestionDTO> generate(final QlcRequest request) {
        return qlcService.getQuestions(
            request.program(), request.languageAsLocale(), request.finderNames(), request.dimensions(),
            request.scopes(), request.maxQuestions(), request.balanced(), request.perCell(), request.shuffle(),
            request.seed()
        );
    }
}
