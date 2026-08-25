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
        "shared", "web_ui.catalogue", "web_ui.persistence", "web_ui.support"
    },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.statistics;

import org.springframework.modulith.ApplicationModule;
