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

import java.net.URI;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;

@Profile(Profiles.CODE_READABILITY)
@Component
@ConfigurationProperties(prefix = "litterbox-web.code-readability")
public class CodeReadabilityConfig {

    private URI url;
    private Double zoomLevel;

    public void setUrl(final URI url) {
        this.url = url;
    }

    public URI getUrl() {
        return url;
    }

    public void setZoomLevel(final Double zoomLevel) {
        this.zoomLevel = zoomLevel;
    }

    public double getZoomLevel() {
        Objects.requireNonNull(zoomLevel);
        assert zoomLevel > 0;
        return zoomLevel;
    }
}
