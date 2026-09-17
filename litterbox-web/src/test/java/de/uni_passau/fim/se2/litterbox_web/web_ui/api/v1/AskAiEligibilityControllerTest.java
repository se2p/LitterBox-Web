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

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.CacheControl;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.configuration.ExceptionTranslator;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.configuration.WebUiExceptionTranslator;

class AskAiEligibilityControllerTest {

    @ParameterizedTest
    @ValueSource(strings = { ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
    void permitsAndAnswersUnderBothApiPrefixes(final String prefix) {
        client(true).get().uri(prefix + "/ask-ai/eligibility").exchange()
            .expectStatus().isOk()
            .expectHeader().cacheControl(CacheControl.noStore().cachePrivate())
            .expectBody(AskAiEligibilityDto.class)
            .isEqualTo(new AskAiEligibilityDto(ApiV1.SCHEMA_VERSION, true));
    }

    @Test
    void reportsWhenTheFeatureIsDisabled() {
        client(false).get().uri(ApiV1.BASE_PATH + "/ask-ai/eligibility").exchange()
            .expectStatus().isEqualTo(503)
            .expectBody()
            .jsonPath("$.code").isEqualTo("ask_ai_unavailable")
            .jsonPath("$.status").isEqualTo(503);
    }

    private static WebTestClient client(final boolean enabled) {
        final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
        configuration.setEnabled(enabled);
        return WebTestClient.bindToController(new AskAiEligibilityController(configuration))
            .controllerAdvice(new ExceptionTranslator(), new WebUiExceptionTranslator())
            .build();
    }
}
