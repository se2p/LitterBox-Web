/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    private final Resource index;

    public SpaController(
        final ResourceLoader resourceLoader,
        @Value(
            "${litterbox.web.static-location:"
                + SpaResourceConfiguration.DEFAULT_STATIC_LOCATION + "}"
        ) final String staticLocation
    ) {
        final String location = staticLocation.endsWith("/") ? staticLocation : staticLocation + "/";
        this.index = resourceLoader.getResource(location + "index.html");
    }

    // "/status" no longer names a page. It stays on the list so a bookmark of it still reaches the application,
    // which sends the reader on to the analyser rather than leaving them at a 404.
    @GetMapping(
        value = {
            "/litterbox", "/litterbox/", "/litterbox/status", "/litterbox/submit",
            "/litterbox/teacher", "/litterbox/teacher/modify", "/litterbox/tools", "/litterbox/advanced",
            "/litterbox/compare", "/litterbox/questions",
            "/litterbox/teacher/questions", "/litterbox/teacher/questions/{token}",
            "/litterbox/questions/{token}", "/litterbox/submissions/{token}", "/litterbox/catalogue",
            "/litterbox/statistics", "/litterbox/about", "/litterbox/contact", "/litterbox/faq", "/litterbox/imprint",
            "/litterbox/privacy"
        },
        produces = MediaType.TEXT_HTML_VALUE
    )
    public ResponseEntity<Resource> index() {
        if (!index.exists()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
            .cacheControl(CacheControl.noCache())
            .contentType(MediaType.TEXT_HTML)
            .body(index);
    }
}
