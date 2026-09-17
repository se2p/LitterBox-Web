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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.CacheControl;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.configuration.ExceptionTranslator;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiProblemException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiQuestionCatalogue;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiQuestionsView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.configuration.WebUiExceptionTranslator;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AskAiQuestionsControllerTest {

    private static final String SUBMISSIONS_PATH = "/submissions/";
    private static final String ANALYSES_PATH = "/analyses/";
    private static final String QUESTIONS_PATH = "/ask-ai/questions";
    private static final String JSON_CODE_PATH = "$.code";
    private static final String TOKEN = "synthetic-share-token";
    private static final String AUTHORIZATION = "Bearer " + TOKEN;
    private static final long ANALYSIS_ID = 111;
    private static final Set<String> EXPECTED_KEYS = Set.of(
        "schemaVersion", "inquiries", "findings", "targets", "truncated", "previewsTruncated"
    );
    private static final AskAiQuestionsView VIEW = new AskAiQuestionsView(
        1,
        List.of(new AskAiQuestionsView.Inquiry("inquiry:v1-a", "event", "What starts it?", "target:v1-cat")),
        List.of(new AskAiQuestionsView.Finding("finding:v1-b", "Says nothing", "bug", "target:v1-cat", "F", "")),
        List.of(new AskAiQuestionsView.Target("target:v1-cat", "sprite", "Cat", "", "", null, List.of("SUMMARISE"))),
        false,
        false
    );

    private final AskAiQuestionCatalogue catalogue = mock(AskAiQuestionCatalogue.class);

    @Test
    void returnsTheExactFrozenShapeUnderTheDefaultApiPrefix() {
        assertExactShape(
            client(true, catalogue()).get()
                .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + QUESTIONS_PATH)
                .header("Authorization", AUTHORIZATION)
                .exchange()
        );
    }

    @Test
    void disabledFeatureIsUnavailableBeforeTouchingTheToken() {
        client(false, catalogue()).get()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + QUESTIONS_PATH)
            .exchange()
            .expectStatus().isEqualTo(503)
            .expectBody()
            .jsonPath(JSON_CODE_PATH).isEqualTo("ask_ai_unavailable");
    }

    @Test
    void requiresAnAuthorizationHeaderBeforeAnythingElse() {
        client(true, catalogue()).get()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + QUESTIONS_PATH)
            .exchange()
            .expectStatus().isUnauthorized()
            .expectBody()
            .jsonPath(JSON_CODE_PATH).isEqualTo("authorization_required");
    }

    @Test
    void rejectsAMismatchedBearerAsAMissingAnalysisRatherThanRevealingTheMismatch() {
        client(true, catalogue()).get()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + QUESTIONS_PATH)
            .header("Authorization", "Bearer unrelated-token")
            .exchange()
            .expectStatus().isNotFound()
            .expectBody()
            .jsonPath(JSON_CODE_PATH).isEqualTo("analysis_not_found");
    }

    @Test
    void answersWithTheDedicatedContextNotFoundCodeForAnUnrelatedAnalysisId() {
        client(true, catalogue()).get()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + (ANALYSIS_ID + 999) + QUESTIONS_PATH)
            .header("Authorization", AUTHORIZATION)
            .exchange()
            .expectStatus().isNotFound()
            .expectBody()
            .jsonPath(JSON_CODE_PATH).isEqualTo("ask_ai_context_not_found");
    }

    @Test
    void rejectsAnUnsupportedLocaleAsAnInvalidRequest() {
        client(true, catalogue()).get()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID
                    + "/ask-ai/questions?locale=fr"
            )
            .header("Authorization", AUTHORIZATION)
            .exchange()
            .expectStatus().isBadRequest()
            .expectBody()
            .jsonPath(JSON_CODE_PATH).isEqualTo("invalid_request");
    }

    private void assertExactShape(final WebTestClient.ResponseSpec response) {
        final byte[] body = response.expectStatus().isOk()
            .expectHeader().cacheControl(CacheControl.noStore().cachePrivate())
            .expectBody().returnResult().getResponseBody();
        assertThat(body).isNotNull();
        final JsonNode root = JsonMapper.shared().readTree(body);
        assertThat(root.isObject()).isTrue();
        assertThat(propertyNameSet(root)).isEqualTo(EXPECTED_KEYS);
        assertThat(root.path("schemaVersion").intValue()).isEqualTo(1);
        assertThat(root.path("inquiries").isArray()).isTrue();
        root.path("inquiries").forEach(
            entry -> assertThat(propertyNameSet(entry)).isEqualTo(Set.of("selector", "kind", "label", "target"))
        );
        assertThat(root.path("findings").isArray()).isTrue();
        root.path("findings").forEach(
            entry -> assertThat(propertyNameSet(entry))
                .isEqualTo(Set.of("selector", "label", "family", "target", "finder", "scratchblocks"))
        );
        assertThat(root.path("targets").isArray()).isTrue();
        root.path("targets").forEach(
            entry -> assertThat(propertyNameSet(entry))
                .isEqualTo(Set.of("key", "kind", "label", "parent", "scratchblocks", "thumbnail", "intents"))
        );
        // Presence is part of the response contract, including when false.
        assertThat(root.path("truncated").isBoolean()).isTrue();
        assertThat(root.path("previewsTruncated").isBoolean()).isTrue();
    }

    private Set<String> propertyNameSet(final JsonNode node) {
        return new HashSet<>(node.propertyNames());
    }

    private WebTestClient client(final boolean enabled, final AskAiQuestionCatalogue questionCatalogue) {
        final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
        configuration.setEnabled(enabled);
        return WebTestClient.bindToController(new AskAiQuestionsController(configuration, questionCatalogue))
            .controllerAdvice(new ExceptionTranslator(), new WebUiExceptionTranslator())
            .build();
    }

    private AskAiQuestionCatalogue catalogue() {
        when(catalogue.questions(eq(TOKEN), eq(ANALYSIS_ID), any())).thenReturn(Mono.just(VIEW));
        when(catalogue.questions(eq(TOKEN), eq(ANALYSIS_ID + 999), any()))
            .thenReturn(Mono.error(AskAiProblemException.contextNotFound()));
        when(catalogue.questions(eq(TOKEN), eq(ANALYSIS_ID), eq("fr")))
            .thenReturn(Mono.error(new IllegalArgumentException("Unsupported locale")));
        return catalogue;
    }
}
