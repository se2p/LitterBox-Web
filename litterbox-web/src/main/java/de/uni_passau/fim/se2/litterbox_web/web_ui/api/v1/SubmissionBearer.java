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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;

/** The submission bearer-token check, compared in constant time so a token cannot be guessed character by character. */
final class SubmissionBearer {

    private SubmissionBearer() {
        // utility class, intentionally empty
    }

    /** The token an {@code Authorization: Bearer} header carries; a missing, malformed or empty one is refused. */
    static String parse(final String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw CapabilityException.authorizationRequired();
        }
        final String bearer = authorization.substring(7).trim();
        if (bearer.isEmpty()) {
            throw CapabilityException.authorizationRequired();
        }
        return bearer;
    }

    /** Rejects a request whose {@code Authorization} header is missing, malformed, or does not name this submission. */
    static void requireMatching(final String submissionToken, final String authorization) {
        final String bearer = parse(authorization);
        if (
            !MessageDigest.isEqual(
                submissionToken.getBytes(StandardCharsets.UTF_8), bearer.getBytes(StandardCharsets.UTF_8)
            )
        ) {
            throw CapabilityException.analysisNotFound();
        }
    }

    /**
     * The no-store, private JSON envelope every Ask AI response with a body is answered with; see
     * {@link #noContentResponse()} for the empty one a close endpoint returns instead.
     */
    static <T> ResponseEntity<T> jsonResponse(final T body) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore().cachePrivate())
            .contentType(MediaType.APPLICATION_JSON)
            .body(body);
    }

    /** The same no-store, private headers as {@link #jsonResponse}, on a 204 with no body. */
    static ResponseEntity<Void> noContentResponse() {
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build();
    }
}
