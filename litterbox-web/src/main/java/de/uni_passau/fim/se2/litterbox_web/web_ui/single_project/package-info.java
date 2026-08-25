/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/** Single-project ingestion, analysis orchestration, and public resource contracts. */
@ApplicationModule(
    allowedDependencies = {
        "qlc", "shared", "web_ui.catalogue", "web_ui.execution", "web_ui.persistence", "web_ui.support"
    }
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import org.springframework.modulith.ApplicationModule;
