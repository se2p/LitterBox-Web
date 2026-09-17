/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/**
 * Spring configuration that exists only because the site is served: where its files come from, the headers they are
 * served under, the schema its tables live in, and the failures only its endpoints can raise.
 */
@ApplicationModule(
    displayName = "Web UI configuration",
    allowedDependencies = {
        "shared", "web_ui.ask_ai", "web_ui.capabilities", "web_ui.execution", "web_ui.persistence",
        "web_ui.statistics", "web_ui.support"
    },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import org.springframework.modulith.ApplicationModule;
