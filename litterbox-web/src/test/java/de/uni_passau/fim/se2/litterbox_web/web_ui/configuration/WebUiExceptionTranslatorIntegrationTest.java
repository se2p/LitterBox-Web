/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;

/**
 * The advice is registered for {@code web_ui} alone, so what it answers has to be asked over the wire rather than by
 * calling the handler: a scope that excluded the endpoints it is meant for would still pass every unit test.
 */
@SpringBootTest
@ActiveProfiles({ "test", WebUiProfiles.PUBLIC_WEB })
class WebUiExceptionTranslatorIntegrationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void answersAWebUiEndpointsOwnFailureWithItsProblemDetail() {
        final Map<String, Object> reference = Map.of("token", "synthetic-share-token", "analysisId", 1);

        WebTestClient.bindToApplicationContext(applicationContext)
            .build()
            .post()
            .uri("/litterbox/api/v1/diffs")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("before", reference, "after", reference))
            .exchange()
            .expectStatus().isNotFound()
            .expectBody()
            .jsonPath("$.type").isEqualTo("urn:litterbox:problem:capability-disabled")
            .jsonPath("$.code").isEqualTo("capability_disabled");
    }
}
