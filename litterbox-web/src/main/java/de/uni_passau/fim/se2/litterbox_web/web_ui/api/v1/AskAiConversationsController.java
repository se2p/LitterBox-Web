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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConversationCreatedView;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConversationService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiMessageResponseView;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class AskAiConversationsController {

    private static final String PATH = "/submissions/{token}/analyses/{analysisId}/ask-ai/conversations";

    private final AskAiConfigurationProperties configuration;
    private final AskAiConversationService service;

    public AskAiConversationsController(
        final AskAiConfigurationProperties configuration, final AskAiConversationService service
    ) {
        this.configuration = configuration;
        this.service = service;
    }

    /**
     * Creates a conversation for a selected question.
     *
     * @param token         The submission token.
     * @param analysisId    The analysis to ask about.
     * @param authorization The matching bearer authorization.
     * @param request       The selected scope and locale.
     * @return The new conversation and its reply budget.
     */
    @PostMapping(
        value = PATH,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AskAiConversationCreatedView>> create(
        @PathVariable final String token,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AskAiCreateConversationRequest request
    ) {
        authorize(token, authorization);
        return service
            .createConversation(token, analysisId, request.locale(), request.scopeKind(), request.scopeSelector())
            .map(SubmissionBearer::jsonResponse);
    }

    /**
     * Sends one question or follow-up within the conversation.
     *
     * @param token          The submission token.
     * @param analysisId     The analysis to ask about.
     * @param conversationId The open conversation.
     * @param authorization  The matching bearer authorization.
     * @param request        The question or follow-up to send.
     * @return The response with the updated reply count.
     */
    @PostMapping(
        value = PATH + "/{conversationId}/messages",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AskAiMessageResponseView>> postMessage(
        @PathVariable final String token,
        @PathVariable final long analysisId,
        @PathVariable final String conversationId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AskAiMessageRequest request
    ) {
        authorize(token, authorization);
        final String clientMessageId = request.clientMessageId();
        final String action = request.action();
        final String followUp = request.followUp();
        return service.postMessage(token, analysisId, conversationId, clientMessageId, action, followUp)
            .map(SubmissionBearer::jsonResponse);
    }

    @PostMapping(value = PATH + "/{conversationId}/close")
    public Mono<ResponseEntity<Void>> close(
        @PathVariable final String token,
        @PathVariable final long analysisId,
        @PathVariable final String conversationId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        authorize(token, authorization);
        return service.closeConversation(token, analysisId, conversationId)
            .thenReturn(SubmissionBearer.noContentResponse());
    }

    private void authorize(final String token, final String authorization) {
        configuration.requireReady();
        SubmissionBearer.requireMatching(token, authorization);
    }
}
