/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.support;

/**
 * Profile names for the deployments that serve the web UI.
 *
 * <p>
 * Held here rather than beside the analyser profiles in {@code shared}: this one gates the site's own beans and nothing
 * else, and a name in a shared constants class is an invitation to gate something else with it.
 */
public final class WebUiProfiles {

    /** A deployment that serves the site to the public internet. */
    public static final String PUBLIC_WEB = "public-web";

    private WebUiProfiles() {
        // utility class, intentionally empty
    }
}
