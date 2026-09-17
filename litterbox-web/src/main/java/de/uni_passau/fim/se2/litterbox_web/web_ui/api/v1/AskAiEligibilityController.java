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

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;

/** Reports readiness; the gateway must restrict every Ask AI API route, not only this check. */
@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class AskAiEligibilityController {

    private final AskAiConfigurationProperties configuration;

    public AskAiEligibilityController(final AskAiConfigurationProperties configuration) {
        this.configuration = configuration;
    }

    @GetMapping(
        value = "/ask-ai/eligibility",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<AskAiEligibilityDto> eligibility() {
        configuration.requireReady();
        return SubmissionBearer.jsonResponse(new AskAiEligibilityDto(ApiV1.SCHEMA_VERSION, true));
    }
}
