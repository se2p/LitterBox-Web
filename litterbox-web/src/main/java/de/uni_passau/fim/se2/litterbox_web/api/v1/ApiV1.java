/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.api.v1;

import java.util.List;
import java.util.Locale;

public final class ApiV1 {

    public static final String BASE_PATH = "/api/v1";
    public static final String WEB_BASE_PATH = "/litterbox" + BASE_PATH;
    public static final int SCHEMA_VERSION = 1;

    /**
     * The languages this API answers in. Named once because it is both advertised to a client and used to decide what
     * an incoming request is given; a list that is advertised but not honoured is worse than no list at all.
     */
    public static final List<String> SUPPORTED_LOCALES = List.of("de", "en", "es", "nl");

    private ApiV1() {
        // utility class, intentionally empty
    }

    /**
     * The language a request is answered in. Anything outside the supported set is answered in English rather than
     * refused: a reader whose browser asks for a language this service does not speak still wants their report.
     */
    public static String publicLocale(final Locale locale) {
        if (locale == null) {
            return "en";
        }
        final String language = locale.getLanguage();
        return SUPPORTED_LOCALES.contains(language) ? language : "en";
    }
}
