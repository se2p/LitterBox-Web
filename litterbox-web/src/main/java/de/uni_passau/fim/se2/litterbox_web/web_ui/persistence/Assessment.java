/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.time.Instant;

public record Assessment(
    long id,
    String publicToken,
    String teacherToken,
    long analysisId,
    String title,
    String instructions,
    String locale,
    String questionsJson,
    String status,
    Instant expiresAt,
    int attempts
) {

    public static final String OPEN = "OPEN";

    public static final String CLOSED = "CLOSED";

    public boolean answerable(final Instant now) {
        return OPEN.equals(status) && now.isBefore(expiresAt);
    }
}
