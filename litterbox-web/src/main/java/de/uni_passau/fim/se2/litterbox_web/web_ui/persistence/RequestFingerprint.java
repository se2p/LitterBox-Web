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

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * What a request is, as a digest two requests carrying one idempotency key can be compared by.
 *
 * <p>
 * The digest of the bytes will not do on its own, in either direction. A project fetched from Scratch is packed with
 * the moment it was fetched written into it, so asking for the same project twice produces two different files, and a
 * repeat of exactly the request the key was bound to was refused as though it were a different one. And the same bytes
 * sent again in another language, or under another version of LitterBox, is a different request that was accepted and
 * answered with the first one's submission — which matters because a repeat may go on to finish a submission the first
 * attempt left unbuilt, and it would then be finishing it to its own description rather than the one the submission was
 * created under.
 *
 * <p>
 * What stands here instead is everything the request said about itself together with an identity for what it is asking
 * about: the bytes for a request that carries its project, and the name the project is fetched under for a request that
 * only points at one. Fields are fed in length-prefixed, so no run of them can be read as a different run.
 */
final class RequestFingerprint {

    private static final byte ABSENT = 0;
    private static final byte PRESENT = 1;

    private RequestFingerprint() {
    }

    /**
     * The fingerprint of a request described by {@code fields}, in the order they are given.
     *
     * @param kind   what sort of request this is, so that two kinds sharing a scope cannot collide
     * @param fields what the request said about itself, any of which may be absent
     */
    static byte[] of(final String kind, final String... fields) {
        final MessageDigest digest = Digests.sha256();
        feed(digest, kind);
        for (final String field : fields) {
            feed(digest, field);
        }
        return digest.digest();
    }

    /**
     * Feeds one field in, marked as present or absent and prefixed with its length.
     *
     * <p>
     * Without the length, {@code ("ab", "c")} and {@code ("a", "bc")} are the same run of bytes and so the same
     * request. Without the marker, an absent field and an empty one are.
     */
    private static void feed(final MessageDigest digest, final String field) {
        if (field == null) {
            digest.update(ABSENT);
            return;
        }
        final byte[] encoded = field.getBytes(StandardCharsets.UTF_8);
        digest.update(PRESENT);
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(encoded.length).array());
        digest.update(encoded);
    }
}
