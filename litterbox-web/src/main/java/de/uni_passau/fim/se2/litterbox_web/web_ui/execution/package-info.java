/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/** The bounded pool the site's own analyses are run on, and what it answers when it is full. */
@ApplicationModule(
    allowedDependencies = { "shared", "web_ui.support" },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.execution;

import org.springframework.modulith.ApplicationModule;
