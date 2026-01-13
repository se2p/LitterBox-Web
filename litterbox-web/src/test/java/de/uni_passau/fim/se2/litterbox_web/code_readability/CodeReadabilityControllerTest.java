/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.net.URI;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.configuration.ExceptionTranslator;
import de.uni_passau.fim.se2.litterbox_web.screenshot.ScreenshotConfig;
import de.uni_passau.fim.se2.litterbox_web.screenshot.ScreenshotService;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;
import mockwebserver3.RecordedRequest;

class CodeReadabilityControllerTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Autowired
    private ScreenshotConfig screenshotConfig;

    @Autowired
    private CodeReadabilityConfig codeReadabilityConfig;

    @BeforeEach
    void setUp() {
        final URI serverUri = URI.create("http://localhost:" + mockWebServer.getPort());
        screenshotConfig.setUrl(serverUri);
        codeReadabilityConfig.setUrl(serverUri);
        codeReadabilityConfig.setZoomLevel(0.5625);
    }

    @ParameterizedTest
    @MethodSource("spriteNameArguments")
    void testComputeReadability(Collection<String> spriteNames)
        throws IOException, InterruptedException {
        final String svg = FixtureLoader.loadFixture("screenshotTest.svg");
        final var screenshotResponse = new ScreenshotService.ScreenshotResponse(Map.of("Sprite1", svg));
        enqueueMockWebServerJsonResponse(screenshotResponse);

        final var codeReadabilityResponse = new CodeReadabilityService.SpriteReadability(true, 0.76);
        enqueueMockWebServerJsonResponse(codeReadabilityResponse);

        final String fixture = FixtureLoader.loadFixture("tokenizingTest.json");
        final var request = new CodeReadabilityRequestDto(fixture, Optional.ofNullable(spriteNames));

        final var response = requestUtilService.postWithResponseBody(
            "/code-readability",
            request,
            new ParameterizedTypeReference<Map<String, CodeReadabilityService.SpriteReadability>>() {
            }, HttpStatus.OK
        );

        assertEquals(Map.of("Sprite1", codeReadabilityResponse), response);

        // First request is for screenshot
        mockWebServer.takeRequest();
        final RecordedRequest recordedRequest = mockWebServer.takeRequest();
        assertAll(
            () -> assertThat(recordedRequest.getMethod()).isEqualTo("POST"),
            () -> assertThat(recordedRequest.getTarget()).isEqualTo("/code-readability")
        );
    }

    @Test
    void testHttpClientErrorHandling() throws IOException {
        final String fixture = FixtureLoader.loadFixture("tokenizingTest.json");
        final var request = new CodeReadabilityRequestDto(fixture, Optional.empty());
        final var responseJson = Map.of(
            "message", "some error message",
            "stack", "detailed NodeJS stack trace"
        );

        enqueueMockWebServerJsonResponse(responseJson, HttpStatus.BAD_REQUEST);

        final ExceptionTranslator.HttpClientErrorDto response = requestUtilService.postWithResponseBody(
            "/code-readability", request, ExceptionTranslator.HttpClientErrorDto.class, HttpStatus.BAD_REQUEST
        );

        assertAll(
            () -> assertThat(response.upstreamUri().toString()).contains("http://localhost", "/svg?sprites="),
            // message defined as part of the exception in LitterBox-Web
            () -> assertThat(response.message()).contains("Invalid", "request"),
            // original responseJson
            () -> assertThat(response.upstreamResponse()).contains("some error message", "NodeJS")
        );
    }

    private static Stream<Collection<String>> spriteNameArguments() {
        return Stream.of(null, Set.of("Sprite1"));
    }
}
