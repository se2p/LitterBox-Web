/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.support;

import java.util.List;

/** Locales supported by API requests and responses. */
public final class SupportedLocales {

    public static final List<String> ALL = List.of("de", "en", "es", "nl");

    private SupportedLocales() {
    }

    public static boolean contains(final String locale) {
        return ALL.contains(locale);
    }
}
