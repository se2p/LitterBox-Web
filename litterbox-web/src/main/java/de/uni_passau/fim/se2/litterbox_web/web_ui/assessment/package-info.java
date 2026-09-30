/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/** Token-addressed, aggregate-only quizzes built from a single project's generated questions. */
@ApplicationModule(
    allowedDependencies = {
        "shared", "web_ui.capabilities", "web_ui.persistence", "web_ui.single_project", "web_ui.support"
    },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import org.springframework.modulith.ApplicationModule;
