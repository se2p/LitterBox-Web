/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Lazy;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import reactor.core.publisher.Flux;

/**
 * Thin proxy to an OpenAI-compatible LLM inference endpoint. Builds the provider request from the neutral hint prompts
 * and streams the SSE response back. The API key is injected server-side and never exposed to the browser.
 *
 * <p>
 * The request format is selected via {@link RawLlmConfig#getApi()}:
 * <ul>
 * <li>{@link LlmApiStyle#RESPONSES} – OpenAI Responses API; uses {@code input}, {@code max_output_tokens}, and
 * {@code reasoning.effort}.</li>
 * <li>{@link LlmApiStyle#CHAT_COMPLETIONS} – Chat Completions API; uses {@code messages}, {@code max_tokens}, and
 * {@code chat_template_kwargs.enable_thinking: false} to suppress Qwen3 chain-of-thought reasoning.</li>
 * </ul>
 */
@Lazy
@Service
public class RawLlmService {

    private static final int MAX_OUTPUT_TOKENS_RESPONSES = 2000;
    private static final int MAX_TOKENS_CHAT_COMPLETIONS = 16000;

    private final RawLlmConfig config;
    private final WebClient client = WebClient.create();

    public RawLlmService(final RawLlmConfig config) {
        this.config = config;
    }

    /**
     * Builds an API-style-specific request from the given prompts and streams the raw SSE events back to the caller.
     *
     * @param systemPrompt The system-role prompt for the model.
     * @param userPrompt   The user-role prompt for the model.
     * @return A stream of raw SSE data lines from the upstream LLM endpoint.
     */
    public Flux<String> stream(final String systemPrompt, final String userPrompt) {
        return switch (config.getApi()) {
            case RESPONSES -> streamViaResponses(systemPrompt, userPrompt);
            case CHAT_COMPLETIONS -> streamViaChatCompletions(systemPrompt, userPrompt);
        };
    }

    private Flux<String> streamViaResponses(final String systemPrompt, final String userPrompt) {
        final URI endpoint = UriComponentsBuilder.fromUri(config.getBaseUrl())
            .path("/responses")
            .build().toUri();

        final Map<String, Object> body = Map.of(
            "model", config.getModel(),
            "reasoning", Map.of("effort", "low"),
            "input", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            ),
            "max_output_tokens", MAX_OUTPUT_TOKENS_RESPONSES,
            "stream", true
        );

        return post(endpoint, body);
    }

    private Flux<String> streamViaChatCompletions(final String systemPrompt, final String userPrompt) {
        final URI endpoint = UriComponentsBuilder.fromUri(config.getBaseUrl())
            .path("/chat/completions")
            .build().toUri();

        final Map<String, Object> body = Map.of(
            "model", config.getModel(),
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            ),
            "max_tokens", MAX_TOKENS_CHAT_COMPLETIONS,
            "stream", true,
            // Disable Qwen3 chain-of-thought: without this the model exhausts the token budget
            // on reasoning_content before any output arrives.
            "chat_template_kwargs", Map.of("enable_thinking", false)
        );

        return post(endpoint, body);
    }

    private Flux<String> post(final URI endpoint, final Map<String, Object> body) {
        return client.post()
            .uri(endpoint)
            .header("Authorization", "Bearer " + config.getApiKey())
            .header("Content-Type", "application/json")
            .accept(MediaType.TEXT_EVENT_STREAM)
            .bodyValue(body)
            .retrieve()
            .bodyToFlux(String.class);
    }
}
