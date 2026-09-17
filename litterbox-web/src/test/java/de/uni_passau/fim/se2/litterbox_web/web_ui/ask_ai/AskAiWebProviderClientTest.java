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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AskAiWebProviderClientTest {

    private static final AskAiPrompt PROMPT = new AskAiPrompt("system prompt", "user prompt with secret data");
    private static final String SECRET_API_KEY = "sk-super-secret-value";

    private MockWebServer server;

    @BeforeEach
    void startServer() throws IOException {
        server = new MockWebServer();
        server.start();
    }

    @AfterEach
    void stopServer() throws IOException {
        server.close();
    }

    @Test
    void completesViaTheResponsesApiWithoutStoringTheRequest() throws InterruptedException {
        enqueue(
            "{\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":"
                + "[{\"type\":\"output_text\",\"text\":\"hello there\"}]}]}"
        );

        final String result = client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
            .block(Duration.ofSeconds(5));

        assertThat(result).isEqualTo("hello there");
        final RecordedRequest request = server.takeRequest();
        assertThat(request.getTarget()).isEqualTo("/responses");
        assertThat(request.getHeaders().get("Authorization")).isEqualTo("Bearer " + SECRET_API_KEY);
        final JsonNode requestBody = JsonMapper.shared().readTree(request.getBody().utf8());
        assertThat(requestBody.path("store").booleanValue()).isFalse();
        assertThat(requestBody.has("reasoning")).isFalse();
    }

    @Test
    void completesViaTheChatCompletionsApiAndExtractsTheMessageContent() throws InterruptedException {
        enqueue("{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"hi\"}}]}");

        final String result = client(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS).complete(PROMPT)
            .block(Duration.ofSeconds(5));

        assertThat(result).isEqualTo("hi");
        final RecordedRequest request = server.takeRequest();
        assertThat(request.getTarget()).isEqualTo("/chat/completions");
        assertThat(request.getHeaders().get("Authorization")).isEqualTo("Bearer " + SECRET_API_KEY);
        final JsonNode requestBody = JsonMapper.shared().readTree(request.getBody().utf8());
        assertThat(requestBody.path("response_format").path("type").textValue()).isEqualTo("json_object");
    }

    @Test
    void neverLogsThePromptOrTheApiKeyOnAnUnparseableResponse() {
        enqueue("not json at all");

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        )
            .isInstanceOf(IllegalStateException.class)
            .hasMessageNotContaining(SECRET_API_KEY)
            .hasMessageNotContaining("secret data");
    }

    @Test
    void appliesTheConfiguredTimeout() {
        server.enqueue(
            new MockResponse.Builder().code(200).headersDelay(500, TimeUnit.MILLISECONDS)
                .body("{\"output\":[]}").build()
        );

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES, Duration.ofMillis(50), 1_000)
                .complete(PROMPT).block(Duration.ofSeconds(5))
        ).hasRootCauseInstanceOf(TimeoutException.class);
    }

    @Test
    void rejectsAResponseBeyondTheBoundedInMemoryLimit() {
        final String hugeText = "x".repeat(2_000);
        enqueue(
            "{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"" + hugeText
                + "\"}]}]}"
        );

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES, Duration.ofSeconds(5), 256)
                .complete(PROMPT).block(Duration.ofSeconds(5))
        ).isNotNull();
    }

    @Test
    void treatsANonSuccessfulStatusAsAFailure() {
        server.enqueue(new MockResponse.Builder().code(500).body("{\"error\":\"boom\"}").build());

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isNotNull();
    }

    @Test
    void rejectsAResponsesEnvelopeWithoutAnyOutputText() {
        enqueue("{\"output\":[{\"type\":\"reasoning\"}]}");

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tellsAReplyCutOffAtTheTokenCapApartFromAWholeOne() {
        enqueue(
            "{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"role\":\"assistant\","
                + "\"content\":\"{\\\"status\\\":\\\"answer\\\",\\\"blocks\\\":[\"}}]}"
        );
        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(AskAiReplyCutShortException.class);

        enqueue(
            "{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"},"
                + "\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"{\"}]}]}"
        );
        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(AskAiReplyCutShortException.class);
    }

    /** A reply the provider stopped for any reason but its own end has words missing, however well it parses. */
    @Test
    void refusesAReplyTheProviderLeftUnfinishedForAnyReasonButLength() {
        enqueue(
            "{\"choices\":[{\"finish_reason\":\"content_filter\",\"message\":{\"role\":\"assistant\","
                + "\"content\":\"{\\\"status\\\":\\\"answer\\\",\\\"blocks\\\":[]}\"}}]}"
        );
        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(IllegalStateException.class).hasMessageContaining("content_filter");

        enqueue(
            "{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"content_filter\"},"
                + "\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\","
                + "\"text\":\"{\\\"status\\\":\\\"answer\\\",\\\"blocks\\\":[]}\"}]}]}"
        );
        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(IllegalStateException.class).hasMessageContaining("incomplete");

        enqueue(
            "{\"status\":\"failed\",\"error\":{\"code\":\"server_error\"},\"output\":[{\"type\":\"message\","
                + "\"content\":[{\"type\":\"output_text\",\"text\":\"{}\"}]}]}"
        );
        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(IllegalStateException.class).hasMessageContaining("failed");
    }

    @Test
    void acceptsAReplyTheProviderCallsWholeWhetherOrNotItSaysSo() {
        enqueue(
            "{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"role\":\"assistant\",\"content\":\"{}\"}}]}"
        );
        assertThat(
            client(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isEqualTo("{}");

        enqueue(
            "{\"status\":\"completed\",\"output\":[{\"type\":\"message\","
                + "\"content\":[{\"type\":\"output_text\",\"text\":\"{}\"}]}]}"
        );
        assertThat(
            client(AskAiConfigurationProperties.ProviderApi.RESPONSES).complete(PROMPT).block(Duration.ofSeconds(5))
        ).isEqualTo("{}");
    }

    @Test
    void rejectsAChatCompletionsEnvelopeWithoutChoices() {
        enqueue("{\"choices\":[]}");

        assertThatThrownBy(
            () -> client(AskAiConfigurationProperties.ProviderApi.CHAT_COMPLETIONS).complete(PROMPT)
                .block(Duration.ofSeconds(5))
        ).isInstanceOf(IllegalStateException.class);
    }

    private void enqueue(final String body) {
        server.enqueue(
            new MockResponse.Builder().code(200).addHeader("Content-Type", "application/json").body(body).build()
        );
    }

    private AskAiWebProviderClient client(final AskAiConfigurationProperties.ProviderApi api) {
        return client(api, Duration.ofSeconds(5), 262_144);
    }

    private AskAiWebProviderClient client(
        final AskAiConfigurationProperties.ProviderApi api, final Duration timeout, final int maxResponseBytes
    ) {
        final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
        configuration.getProvider().setApi(api);
        configuration.getProvider().setBaseUrl(URI.create("http://localhost:" + server.getPort()));
        configuration.getProvider().setApiKey(SECRET_API_KEY);
        configuration.getProvider().setModel("test-model");
        configuration.getProvider().setTimeout(timeout);
        configuration.getProvider().setMaxResponseBytes(maxResponseBytes);
        return new AskAiWebProviderClient(WebClient.builder(), configuration);
    }
}
