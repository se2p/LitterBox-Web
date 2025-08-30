/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.screenshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import mockwebserver3.RecordedRequest;

class ScreenshotServiceTest extends LitterboxWebIntegrationTest {

    @Autowired
    private ScreenshotService screenshotService;

    @Autowired
    private ScreenshotConfig screenshotConfig;

    @BeforeEach
    void setUp() {
        final URI serverUri = URI.create("http://localhost:" + mockWebServer.getPort());
        screenshotConfig.setUrl(serverUri);
    }

    @Test
    void testGenerateSVGScreenshot() throws IOException, InterruptedException {
        final String fixture = FixtureLoader.loadFixture("tokenizingTest.json");
        final String svg = FixtureLoader.loadFixture("screenshotTest.svg");
        final var screenshot = new ScreenshotService.ScreenshotResponse(Map.of("Sprite1", svg));

        enqueueMockWebServerJsonResponse(screenshot);

        final ScreenshotService.ScreenshotResponse response = screenshotService
            .generateSVGScreenshot(new ScreenshotService.ScreenshotRequest(fixture, List.of("Sprite1"), 0.5625))
            .block();

        assertEquals(screenshot, response);
        final RecordedRequest recordedRequest = mockWebServer.takeRequest();
        assertAll(
            () -> assertThat(recordedRequest.getMethod()).isEqualTo("POST"),
            () -> assertThat(recordedRequest.getTarget()).isEqualTo("/svg?sprites=Sprite1&scale=0.5625")
        );
    }

    @Test
    void testGenerateSVGScreenshotOfTwoSprites() throws IOException, InterruptedException {
        final String fixture = FixtureLoader.loadFixture("tokenizingTest.json");
        final String svg = FixtureLoader.loadFixture("screenshotTest.svg");
        final var screenshot = new ScreenshotService.ScreenshotResponse(
            Map.of(
                "Sprite1", svg,
                "Sprite2", svg
            )
        );

        enqueueMockWebServerJsonResponse(screenshot);

        final ScreenshotService.ScreenshotResponse response = screenshotService
            .generateSVGScreenshot(
                new ScreenshotService.ScreenshotRequest(fixture, List.of("Sprite1", "Sprite2"), 0.5625)
            )
            .block();

        assertEquals(screenshot, response);
        final RecordedRequest recordedRequest = mockWebServer.takeRequest();
        // The order of "sprites" query params are undetermined,
        // so asserting url containing components instead of hard comparing
        assertAll(
            () -> assertThat(recordedRequest.getMethod()).isEqualTo("POST"),
            () -> assertThat(recordedRequest.getTarget()).startsWith("/svg?"),
            () -> assertThat(recordedRequest.getTarget()).contains("sprites=Sprite1"),
            () -> assertThat(recordedRequest.getTarget()).contains("sprites=Sprite2"),
            () -> assertThat(recordedRequest.getTarget()).contains("scale=0.5625")
        );
    }
}
