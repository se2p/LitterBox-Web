/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;
import mockwebserver3.RecordedRequest;

class CodeCompletionIntegrationTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Autowired
    private CodeCompletionModelConfig codeCompletionModelConfig;

    @BeforeEach
    void setUp() {
        final URI serverUri = URI.create("http://localhost:" + mockWebServer.getPort());

        codeCompletionModelConfig.setModels(
            Map.of(
                CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER,
                new CodeCompletionModelConfig.ModelConfig(serverUri),
                CodeCompletionModelConfig.CodeCompletionModelType.N_GRAM,
                new CodeCompletionModelConfig.ModelConfig(serverUri)
            )
        );
    }

    @ParameterizedTest
    @ValueSource(ints = { -10, -1, 0 })
    void defaultToFiveCompletions(final int requestCount) throws ParsingException, IOException {
        final Program fixture = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final var request = new CodeCompletionRequestDto(
            fixture, CodeCompletionModelConfig.CodeCompletionModelType.N_GRAM, requestCount
        );

        assertThat(request.topkPredictions()).isEqualTo(5);
    }

    @Test
    void dummyCodeCompletionRequest() throws ParsingException, IOException, InterruptedException {
        final var completionModelResponse = new CodeCompletionService.CodeCompletionResponse(
            List.of(new CodeCompletionService.CodeCompletionPrediction("dummy_token", 0.3))
        );
        enqueueMockWebServerJsonResponse(completionModelResponse);

        final Program fixture = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final var request = new CodeCompletionRequestDto(
            fixture, CodeCompletionModelConfig.CodeCompletionModelType.TRANSFORMER, 5
        );

        final var response = requestUtilService.postWithResponseBody(
            "/code-completion", request, CodeCompletionService.CodeCompletionBlocks.class, HttpStatus.OK
        );
        assertThat(response.blockType()).containsExactly("dummy_token");

        final RecordedRequest recordedRequest = mockWebServer.takeRequest();
        assertAll(
            () -> assertThat(recordedRequest.getMethod()).isEqualTo("POST"),
            () -> assertThat(recordedRequest.getTarget()).isEqualTo("/")
        );
    }
}
