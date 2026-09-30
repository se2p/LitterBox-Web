/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.util.List;
import java.util.Locale;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.SupportedLocales;

public final class ApiV1 {

    public static final String BASE_PATH = "/api/v1";
    public static final String WEB_BASE_PATH = "/litterbox" + BASE_PATH;
    public static final int SCHEMA_VERSION = 1;

    /** Locales supported by API requests and responses. */
    public static final List<String> SUPPORTED_LOCALES = SupportedLocales.ALL;

    private ApiV1() {
    }

    /** Falls back to English when the requested locale is unsupported. */
    public static String publicLocale(final Locale locale) {
        if (locale == null) {
            return "en";
        }
        final String language = locale.getLanguage();
        return SUPPORTED_LOCALES.contains(language) ? language : "en";
    }
}
