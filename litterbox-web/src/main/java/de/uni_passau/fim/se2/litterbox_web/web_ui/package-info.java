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
 * Everything that exists because this service also serves a web UI.
 *
 * <p>
 * The site's own endpoints, the storage its submissions live in, the queues it is served from, and the resources it
 * renders. Nothing outside this package may reach into it: the machinery here is shaped by what a browser session
 * needs, and the other endpoints answer machines that need none of it. {@code WebUiBoundaryTest} is where that is held,
 * and holding it is the point — an executor meant for one page's request queue had reached four unrelated endpoints
 * before the boundary was written down.
 *
 * <p>
 * The dependency runs one way only, and outwards: what is here may use the analysers and the shared services, and is
 * free to. The rule is about what may use <em>this</em>.
 */
@ApplicationModule(
    displayName = "Web UI",
    allowedDependencies = { "qlc", "shared" },
    type = ApplicationModule.Type.OPEN
)
package de.uni_passau.fim.se2.litterbox_web.web_ui;

import org.springframework.modulith.ApplicationModule;
