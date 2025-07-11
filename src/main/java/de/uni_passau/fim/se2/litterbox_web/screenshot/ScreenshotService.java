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
     * Extract the SVG representation of a given sprite.
     *
     * @param programJSON Scratch Program
     * @param spriteName  Name of the sprite that you want to take screenshot of.
     * @param scale       The zoom level in which the screenshot will be taken.
     * @return The SVGScreenshot that contains SVG string.
     */
    public Mono<SVGScreenshot> generateSVGScreenshot(
        final String programJSON,
        final String spriteName,
        final double scale
    ) {
        final URI url = UriComponentsBuilder.fromUri(screenshotConfig.getUrl())
            .path("/svg")
            .queryParam("sprite", URLEncoder.encode(spriteName, StandardCharsets.UTF_8))
            .queryParam("scale", scale)
            .build(true).toUri();

        return externalApiConnector.postEntity(url, programJSON, SVGScreenshot.class);
    }

    public record SVGScreenshot(String svg) {
    }
}
