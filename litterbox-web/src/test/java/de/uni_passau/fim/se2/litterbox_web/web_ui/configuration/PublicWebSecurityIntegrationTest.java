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

import static org.assertj.core.api.Assertions.assertThat;

import java.util.logging.Level;
import java.util.logging.Logger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.llm.LlmController;
import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;

/**
 * One of these asks the application for an asset, which is a question only a database can answer.
 *
 * <p>
 * It used to be asked of whatever happened to be listening on the usual port, and the request failed with a server
 * error that the test — which looked only at a header — accepted. A header on a 500 is not the guarantee this is about,
 * so the schema is real and the status is part of what is asserted.
 */
@SpringBootTest
@ActiveProfiles({ "test", WebUiProfiles.PUBLIC_WEB })
class PublicWebSecurityIntegrationTest {

    private static TestDatabase database;

    @Autowired
    private ApplicationContext applicationContext;

    @BeforeAll
    static void createSchema() {
        database = TestDatabase.freshSchema("public_web").migrated();
    }

    @AfterAll
    static void dropSchema() {
        database.close();
    }

    @DynamicPropertySource
    static void useTheSchema(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", database::jdbcUrl);
        registry.add("spring.datasource.username", database::username);
        registry.add("spring.datasource.password", database::password);
    }

    /**
     * A deployment without the llm profile has no llm handler, so those routes answer with nothing rather than being
     * refused. What used to make this a refusal was a rule denying them wherever the public site was served, and the
     * two profiles could not be enabled together at all; both are gone, so an operator may now serve them side by side
     * and it is the deployment, not this service, that decides who can reach them.
     */
    @Test
    void publicDeploymentHasNoLlmHandler() {
        assertThat(applicationContext.getBeansOfType(LlmController.class)).isEmpty();

        WebTestClient.bindToApplicationContext(applicationContext)
            .configureClient()
            .build()
            .post()
            .uri("/llm/raw")
            .exchange()
            .expectStatus().isNotFound();
    }

    @Test
    void sensitiveCoreLlmPayloadLoggingIsDisabled() {
        assertThat(Logger.getLogger("de.uni_passau.fim.se2.litterbox.analytics.llm").isLoggable(Level.INFO))
            .isFalse();
        assertThat(Logger.getLogger("de.uni_passau.fim.se2.litterbox.llm").isLoggable(Level.INFO)).isFalse();
    }

    @Test
    void publicResponsesCarrySecurityHeaders() {
        WebTestClient.bindToApplicationContext(applicationContext)
            .configureClient()
            .build()
            .get()
            .uri("/api/v1/capabilities")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
            .expectHeader().valueEquals("X-Frame-Options", "DENY")
            .expectHeader().value(
                "Content-Security-Policy",
                value -> assertThat(value)
                    .contains("img-src 'self' data:")
                    .contains("style-src 'self'")
                    .contains("script-src 'self' 'wasm-unsafe-eval'")
                    .contains("style-src-attr 'unsafe-hashes' 'sha256-17uPHovMxd3t/dCzUeSptM/l876X+D7WnB/OjkfSsc4='")
                    .contains("object-src 'none'")
                    .contains("frame-ancestors 'none'")
            )
            .expectHeader().exists("Permissions-Policy")
            .expectHeader().exists("Referrer-Policy");
    }

    /**
     * A costume may be a vector, which is a document, and the admission check it passed on the way in does not judge
     * its CSS. This policy is what makes that acceptable, so it is asserted whole rather than by parts: nothing may be
     * fetched, `sandbox` keeps a directly navigated costume in an opaque origin, and the sole allowance is inline
     * raster data, which names no origin to reach.
     *
     * <p>
     * The API answers under both prefixes depending on how it is fronted, and a costume served under the one nobody
     * remembered to match would be a document loose in the application's own origin.
     */
    @ParameterizedTest
    @ValueSource(strings = { "/api/v1", "/litterbox/api/v1" })
    void learnerSuppliedCostumesAreSandboxed(final String prefix) {
        WebTestClient.bindToApplicationContext(applicationContext)
            .configureClient()
            .build()
            .get()
            .uri(prefix + "/submissions/synthetic-token/assets/" + "a".repeat(64))
            .exchange()
            .expectStatus().isNotFound()
            .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
            .expectHeader().value(
                "Content-Security-Policy",
                value -> assertThat(value)
                    .isEqualTo("default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
            );
    }
}
