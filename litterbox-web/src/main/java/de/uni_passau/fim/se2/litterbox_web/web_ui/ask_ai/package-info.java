/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
@org.springframework.modulith.ApplicationModule(
    allowedDependencies = { "shared", "web_ui.execution", "web_ui.persistence", "web_ui.single_project" },
    type = org.springframework.modulith.ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;
