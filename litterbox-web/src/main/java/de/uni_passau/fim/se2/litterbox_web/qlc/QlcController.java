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

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/qlc")
public class QlcController {

    private final QlcService qlcService;

    public QlcController(final QlcService qlcService) {
        this.qlcService = qlcService;
    }

    /**
     * Generates comprehension questions for the submitted Scratch program.
     *
     * @param request the API request.
     * @return the generated questions.
     */
    @PostMapping("generate")
    public Flux<QuestionDTO> generateQuestions(@RequestBody final QlcRequest request) {
        return Flux.fromStream(
            qlcService.getQuestions(
                request.program(),
                request.languageAsLocale(),
                request.finderNames(),
                request.dimensions(),
                request.scopes(),
                request.maxQuestions(),
                request.balanced(),
                request.perCell(),
                request.shuffle(),
                request.seed()
            )
        );
    }
}
