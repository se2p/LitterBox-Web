/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

/**
 * The lengths the schema will accept for the strings a request carries into it.
 *
 * <p>
 * A column refuses what does not fit, but only once it is written to, and by then the request has been read, its bytes
 * kept and rows made that the failed insert leaves behind. Asking first is what makes a refusal cost nothing.
 *
 * <p>
 * The limits are counted in code points, which is what {@code VARCHAR(n)} counts; a Java string is measured in UTF-16
 * units and would refuse a filename of emoji that the column would have taken.
 */
final class RequestStrings {

    /** {@code idempotency_key.idempotency_key}. */
    private static final int KEY_LIMIT = 255;

    /** {@code idempotency_key.scope}. */
    private static final int SCOPE_LIMIT = 64;

    /** {@code source_artifact.original_filename}, and {@code analysis.project_name} for a project out of a batch. */
    private static final int FILENAME_LIMIT = 255;

    private RequestStrings() {
    }

    static void checkIdempotency(final String scope, final String key) {
        check("Idempotency scope", scope, SCOPE_LIMIT);
        check("Idempotency key", key, KEY_LIMIT);
    }

    static void checkFilename(final String filename) {
        check("Filename", filename, FILENAME_LIMIT);
    }

    private static void check(final String what, final String value, final int limit) {
        if (value != null && value.codePointCount(0, value.length()) > limit) {
            throw new IllegalArgumentException(what + " must not exceed " + limit + " characters");
        }
    }
}
