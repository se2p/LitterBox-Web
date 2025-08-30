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

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import de.uni_passau.fim.se2.litterbox_web.shared.connectors.ExternalApiConnector;
import reactor.core.publisher.Mono;

@Service
@Profile(Profiles.CODE_READABILITY)
public class ScreenshotService {

    private final ScreenshotConfig screenshotConfig;
    private final ExternalApiConnector externalApiConnector;

    public ScreenshotService(
        final ScreenshotConfig screenshotConfig,
        final ExternalApiConnector externalApiConnector
    ) {
        this.screenshotConfig = screenshotConfig;
        this.externalApiConnector = externalApiConnector;
    }

    /**
     * Extract the SVG representation of a given list of sprites.
     *
     * @param request Composition of project JSON, list of sprite names, and zoom level
     * @return A map of sprite name and its SVG string.
     */
    public Mono<ScreenshotResponse> generateSVGScreenshot(final ScreenshotRequest request) {
        Collection<String> sprites = request.sprites().stream()
            .map(s -> URLEncoder.encode(s, StandardCharsets.UTF_8))
            .collect(Collectors.toUnmodifiableSet());
        final URI url = UriComponentsBuilder.fromUri(screenshotConfig.getUrl())
            .path("/svg")
            .queryParam("sprites", sprites)
            .queryParam("scale", request.scale())
            .build(true).toUri();

        return externalApiConnector.postEntity(url, request.projectJson(), ScreenshotResponse.class);
    }

    /**
     * Request to get screenshot
     * 
     * @param projectJson JSON string of a Scratch project
     * @param sprites     List of sprite names to get their screenshots
     * @param scale       Zoom level
     */
    public record ScreenshotRequest(String projectJson, Collection<String> sprites, double scale) {
    }

    /**
     * Response from the screenshot connector
     * 
     * @param screenshots Map of sprite name to SVG
     */
    public record ScreenshotResponse(Map<String, String> screenshots) {
    }

}
