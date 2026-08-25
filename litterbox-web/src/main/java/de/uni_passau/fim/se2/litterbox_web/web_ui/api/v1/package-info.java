/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
@ApplicationModule(
    allowedDependencies = {
        "web_ui.capabilities", "web_ui.catalogue", "web_ui.single_project", "web_ui.statistics"
    },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import org.springframework.modulith.ApplicationModule;
