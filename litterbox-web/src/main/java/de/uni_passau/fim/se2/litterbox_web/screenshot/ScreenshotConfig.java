/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.screenshot;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;

@Profile(Profiles.CODE_READABILITY)
@Component
@ConfigurationProperties(prefix = "litterbox-web.screenshot")
public class ScreenshotConfig {

    private URI url;

    public void setUrl(URI url) {
        this.url = url;
    }

    public URI getUrl() {
        return url;
    }
}
