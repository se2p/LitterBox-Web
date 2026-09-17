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

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Digests for algorithms every Java platform is required to provide.
 *
 * <p>
 * {@link MessageDigest#getInstance(String)} is declared to throw for an unknown algorithm, which SHA-256 and MD5 cannot
 * be. Handling that once here saves every caller a catch block for something that cannot happen.
 */
public final class Digests {

    private Digests() {
    }

    /**
     * Creates a fresh SHA-256 digest.
     *
     * @return a fresh SHA-256 digest
     */
    public static MessageDigest sha256() {
        return of("SHA-256");
    }

    /**
     * Creates a fresh digest for {@code algorithm}.
     *
     * @return a fresh digest for the requested algorithm
     */
    static MessageDigest of(final String algorithm) {
        try {
            return MessageDigest.getInstance(algorithm);
        }
        catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException(algorithm + " is not available", unavailable);
        }
    }
}
