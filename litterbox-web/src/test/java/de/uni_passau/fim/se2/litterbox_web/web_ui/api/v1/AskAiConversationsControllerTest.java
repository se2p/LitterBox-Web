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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.CacheControl;
import org.springframework.test.web.reactive.server.WebTestClient;

import de.uni_passau.fim.se2.litterbox_web.configuration.ExceptionTranslator;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConversationCreatedView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConversationService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiMessageResponseView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiProblemException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiScopeView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.configuration.WebUiExceptionTranslator;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AskAiConversationsControllerTest {

    private static final String SUBMISSIONS_PATH = "/submissions/";
    private static final String ANALYSES_PATH = "/analyses/";
    private static final String CONVERSATIONS_PATH = "/ask-ai/conversations/";
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String SCOPE = "scope";
    private static final String COMMON = "common";
    private static final String TOKEN = "synthetic-share-token";
    private static final String AUTHORIZATION = "Bearer " + TOKEN;
    private static final long ANALYSIS_ID = 111;
    private static final String CONVERSATION_ID = "conversation-public-id";
    private static final Set<String> CREATED_KEYS = Set.of(
        "schemaVersion", "conversationId", SCOPE, "repliesRemaining"
    );
    private static final Set<String> MESSAGE_KEYS = Set.of(
        "schemaVersion", "messageId", "status", "blocks", "references", "followUps", "repliesRemaining"
    );

    private final AskAiConversationService service = mock(AskAiConversationService.class);

    @Test
    void opensAConversationUnderTheDefaultApiPrefix() {
        stubCreate();

        assertCreatedShape(
            client(true).post()
                .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + "/ask-ai/conversations")
                .header(AUTHORIZATION_HEADER, AUTHORIZATION)
                .bodyValue(Map.of("locale", "en", SCOPE, Map.of("kind", COMMON, "selector", "common:SUMMARISE")))
                .exchange()
        );
    }

    @Test
    void requiresARequestBodyToCreateAConversation() {
        client(true).post()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + "/ask-ai/conversations")
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .exchange()
            .expectStatus().isBadRequest();
    }

    @Test
    void disabledFeatureIsUnavailableBeforeTouchingTheToken() {
        client(false).post()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + "/ask-ai/conversations")
            .bodyValue(Map.of("locale", "en", SCOPE, Map.of("kind", COMMON, "selector", "common:SUMMARISE")))
            .exchange()
            .expectStatus().isEqualTo(503)
            .expectBody()
            .jsonPath("$.code").isEqualTo("ask_ai_unavailable");
    }

    @Test
    void requiresAnAuthorizationHeaderToCreateAConversation() {
        client(true).post()
            .uri(ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + "/ask-ai/conversations")
            .bodyValue(Map.of("locale", "en", SCOPE, Map.of("kind", COMMON, "selector", "common:SUMMARISE")))
            .exchange()
            .expectStatus().isUnauthorized()
            .expectBody()
            .jsonPath("$.code").isEqualTo("authorization_required");
    }

    @Test
    void answersOneMessageWithTheFrozenShape() {
        when(
            service.postMessage(eq(TOKEN), eq(ANALYSIS_ID), eq(CONVERSATION_ID), anyString(), anyString(), any())
        ).thenReturn(
            Mono.just(
                new AskAiMessageResponseView(1, "2", "answer", List.of(), List.of(), List.of("EXPLAIN_SIMPLY"), 7)
            )
        );

        final byte[] body = client(true).post()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + CONVERSATIONS_PATH
                    + CONVERSATION_ID + "/messages"
            )
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .bodyValue(Map.of("clientMessageId", "cmid-1", "action", "ASK"))
            .exchange()
            .expectStatus().isOk()
            .expectHeader().cacheControl(CacheControl.noStore().cachePrivate())
            .expectBody().returnResult().getResponseBody();

        assertThat(body).isNotNull();
        final JsonNode root = JsonMapper.shared().readTree(body);
        assertThat(propertyNameSet(root)).isEqualTo(MESSAGE_KEYS);
        assertThat(root.path("status").textValue()).isEqualTo("answer");
        assertThat(root.path("repliesRemaining").intValue()).isEqualTo(7);
    }

    @Test
    void requiresARequestBodyToPostAMessage() {
        client(true).post()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + CONVERSATIONS_PATH
                    + CONVERSATION_ID + "/messages"
            )
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .exchange()
            .expectStatus().isBadRequest();
    }

    static Stream<Arguments> serviceFailures() {
        return Stream.of(
            Arguments.of(AskAiProblemException.contextNotFound(), 404, "ask_ai_context_not_found"),
            Arguments.of(AskAiProblemException.quotaExhausted(), 429, "ask_ai_quota_exhausted"),
            Arguments.of(AskAiProblemException.attemptsExhausted(), 429, "ask_ai_attempts_exhausted"),
            Arguments.of(AskAiProblemException.capacityExhausted(), 503, "ask_ai_capacity_exhausted"),
            Arguments.of(AskAiProblemException.providerUnavailable(null), 503, "ask_ai_provider_unavailable"),
            Arguments.of(AskAiProblemException.timeout(null), 504, "ask_ai_timeout"),
            Arguments.of(AskAiProblemException.invalidModelResponse(null), 502, "ask_ai_invalid_model_response"),
            Arguments.of(AskAiProblemException.idempotencyConflict(), 409, "ask_ai_idempotency_conflict")
        );
    }

    @ParameterizedTest(name = "{2}")
    @MethodSource("serviceFailures")
    void mapsEachServiceFailureToItsStableProblemCode(
        final AskAiProblemException failure, final int status, final String code
    ) {
        when(
            service.postMessage(eq(TOKEN), eq(ANALYSIS_ID), eq(CONVERSATION_ID), anyString(), anyString(), any())
        ).thenReturn(Mono.error(failure));

        client(true).post()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + CONVERSATIONS_PATH
                    + CONVERSATION_ID + "/messages"
            )
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .bodyValue(Map.of("clientMessageId", "cmid-1", "action", "ASK"))
            .exchange()
            .expectStatus().isEqualTo(status)
            .expectBody()
            .jsonPath("$.code").isEqualTo(code);
    }

    @Test
    void closingAConversationRespondsNoContentAndIsIdempotent() {
        when(service.closeConversation(TOKEN, ANALYSIS_ID, CONVERSATION_ID)).thenReturn(Mono.empty());

        client(true).post()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + CONVERSATIONS_PATH
                    + CONVERSATION_ID + "/close"
            )
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .exchange()
            .expectStatus().isNoContent();

        client(true).post()
            .uri(
                ApiV1.BASE_PATH + SUBMISSIONS_PATH + TOKEN + ANALYSES_PATH + ANALYSIS_ID + CONVERSATIONS_PATH
                    + CONVERSATION_ID + "/close"
            )
            .header(AUTHORIZATION_HEADER, AUTHORIZATION)
            .exchange()
            .expectStatus().isNoContent();
    }

    private void stubCreate() {
        when(service.createConversation(eq(TOKEN), eq(ANALYSIS_ID), anyString(), anyString(), anyString()))
            .thenReturn(
                Mono.just(
                    new AskAiConversationCreatedView(1, CONVERSATION_ID, new AskAiScopeView(COMMON, "SUMMARISE"), 8)
                )
            );
    }

    private void assertCreatedShape(final WebTestClient.ResponseSpec response) {
        final byte[] body = response.expectStatus().isOk()
            .expectHeader().cacheControl(CacheControl.noStore().cachePrivate())
            .expectBody().returnResult().getResponseBody();
        assertThat(body).isNotNull();
        final JsonNode root = JsonMapper.shared().readTree(body);
        assertThat(propertyNameSet(root)).isEqualTo(CREATED_KEYS);
        assertThat(root.path("schemaVersion").intValue()).isEqualTo(1);
        assertThat(root.path("conversationId").textValue()).isEqualTo(CONVERSATION_ID);
        assertThat(root.path(SCOPE).path("kind").textValue()).isEqualTo(COMMON);
        assertThat(root.path("repliesRemaining").intValue()).isEqualTo(8);
    }

    private Set<String> propertyNameSet(final JsonNode node) {
        return new HashSet<>(node.propertyNames());
    }

    private WebTestClient client(final boolean enabled) {
        final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
        configuration.setEnabled(enabled);
        return WebTestClient.bindToController(new AskAiConversationsController(configuration, service))
            .controllerAdvice(new ExceptionTranslator(), new WebUiExceptionTranslator())
            .build();
    }

}
