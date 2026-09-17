/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiQuestionCatalogue;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiQuestionsView;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class AskAiQuestionsController {

    private final AskAiConfigurationProperties configuration;
    private final AskAiQuestionCatalogue catalogue;

    public AskAiQuestionsController(
        final AskAiConfigurationProperties configuration, final AskAiQuestionCatalogue catalogue
    ) {
        this.configuration = configuration;
        this.catalogue = catalogue;
    }

    @GetMapping(
        value = "/submissions/{token}/analyses/{analysisId}/ask-ai/questions",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AskAiQuestionsView>> questions(
        @PathVariable final String token,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestParam(defaultValue = "en") final String locale
    ) {
        configuration.requireReady();
        SubmissionBearer.requireMatching(token, authorization);
        return catalogue.questions(token, analysisId, locale).map(SubmissionBearer::jsonResponse);
    }
}
