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
@ApplicationModule(allowedDependencies = { "catalogue", "execution", "persistence", "qlc", "shared" })
package de.uni_passau.fim.se2.litterbox_web.single_project;

import org.springframework.modulith.ApplicationModule;
