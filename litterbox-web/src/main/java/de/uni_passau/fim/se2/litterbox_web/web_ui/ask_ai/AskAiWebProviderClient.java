/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Sends bounded, non-streaming completions without logging prompts or credentials. */
@Service
public final class AskAiWebProviderClient implements AskAiProviderClient {

    private final WebClient client;
    private final AskAiConfigurationProperties configuration;
    private final JsonMapper mapper = JsonMapper.shared();

    @Autowired
    public AskAiWebProviderClient(final WebClient.Builder builder, final AskAiConfigurationProperties configuration) {
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.client = builder.codecs(
            codecs -> codecs.defaultCodecs().maxInMemorySize(configuration.getProvider().getMaxResponseBytes())
        ).build();
    }

    @Override
    public Mono<String> complete(final AskAiPrompt prompt) {
        Objects.requireNonNull(prompt, "prompt");
        return switch (configuration.getProvider().getApi()) {
            case RESPONSES -> completeViaResponses(prompt);
            case CHAT_COMPLETIONS -> completeViaChatCompletions(prompt);
        };
    }

    private Mono<String> completeViaResponses(final AskAiPrompt prompt) {
        final AskAiConfigurationProperties.Provider provider = configuration.getProvider();
        final URI endpoint = UriComponentsBuilder.fromUri(provider.getBaseUrl()).path("/responses").build().toUri();
        final Map<String, Object> body = Map.of(
            "model", provider.getModel(),
            "store", false,
            "input", messages(prompt),
            "max_output_tokens", provider.getMaxOutputTokens()
        );
        return post(endpoint, body).map(this::extractResponsesText);
    }

    private Mono<String> completeViaChatCompletions(final AskAiPrompt prompt) {
        final AskAiConfigurationProperties.Provider provider = configuration.getProvider();
        final URI endpoint = UriComponentsBuilder.fromUri(provider.getBaseUrl()).path("/chat/completions")
            .build().toUri();
        final Map<String, Object> body = Map.of(
            "model", provider.getModel(),
            "messages", messages(prompt),
            "max_tokens", provider.getMaxOutputTokens(),
            "response_format", Map.of("type", "json_object"),
            "chat_template_kwargs", Map.of("enable_thinking", false)
        );
        return post(endpoint, body).map(this::extractChatCompletionsText);
    }

    private static List<Map<String, String>> messages(final AskAiPrompt prompt) {
        return List.of(
            Map.of("role", "system", "content", prompt.systemPrompt()),
            Map.of("role", "user", "content", prompt.userPrompt())
        );
    }

    private Mono<String> post(final URI endpoint, final Map<String, Object> body) {
        final AskAiConfigurationProperties.Provider provider = configuration.getProvider();
        return client.post()
            .uri(endpoint)
            .header("Authorization", "Bearer " + provider.getApiKey())
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(String.class)
            .timeout(provider.getTimeout());
    }

    /**
     * Only a reply the provider itself calls whole is a reply. One it cut off at the token cap is asked for again
     * shorter; one it left unfinished for any other reason — a content filter, a failure — has words missing from it,
     * and text that happens to parse is no evidence they were not the ones that mattered.
     */
    private String extractResponsesText(final String json) {
        final JsonNode root = readObject(json);
        validateResponseStatus(root);
        final JsonNode output = responseOutput(root);
        return outputText(output);
    }

    private static void validateResponseStatus(final JsonNode root) {
        final JsonNode status = root.path("status");
        if (
            isText(status, "incomplete")
                && isText(root.path("incomplete_details").path("reason"), "max_output_tokens")
        ) {
            throw new AskAiReplyCutShortException();
        }
        if (!status.isMissingNode() && !status.isNull() && !isText(status, "completed")) {
            throw new IllegalStateException("Provider response was not completed: " + status.asText());
        }
    }

    private static JsonNode responseOutput(final JsonNode root) {
        final JsonNode output = root.get("output");
        if (output == null || !output.isArray()) {
            throw new IllegalStateException("Provider response has no output");
        }
        return output;
    }

    private static String outputText(final JsonNode output) {
        final StringBuilder text = new StringBuilder();
        for (final JsonNode item : output) {
            final JsonNode content = item.get("content");
            if (content == null || !content.isArray()) {
                continue;
            }
            for (final JsonNode part : content) {
                final String partText = part.path("text").textValue();
                if (partText != null) {
                    text.append(partText);
                }
            }
        }
        if (text.isEmpty()) {
            throw new IllegalStateException("Provider response contained no output text");
        }
        return text.toString();
    }

    private String extractChatCompletionsText(final String json) {
        final JsonNode root = readObject(json);
        final JsonNode choices = root.get("choices");
        if (choices == null || !choices.isArray() || choices.isEmpty()) {
            throw new IllegalStateException("Provider response has no choices");
        }
        final JsonNode finishReason = choices.get(0).path("finish_reason");
        if (isText(finishReason, "length")) {
            throw new AskAiReplyCutShortException();
        }
        if (!finishReason.isMissingNode() && !finishReason.isNull() && !isText(finishReason, "stop")) {
            throw new IllegalStateException("Provider did not finish the reply: " + finishReason.asText());
        }
        final String content = choices.get(0).path("message").path("content").textValue();
        if (content == null || content.isBlank()) {
            throw new IllegalStateException("Provider response contained no message content");
        }
        return content;
    }

    private static boolean isText(final JsonNode node, final String expected) {
        return node.isTextual() && expected.equals(node.asText());
    }

    private JsonNode readObject(final String json) {
        final JsonNode root;
        try {
            root = mapper.readTree(json);
        }
        catch (RuntimeException exception) {
            throw new IllegalStateException("Provider response is not valid JSON", exception);
        }
        if (root == null || !root.isObject()) {
            throw new IllegalStateException("Provider response is not a JSON object");
        }
        return root;
    }
}
