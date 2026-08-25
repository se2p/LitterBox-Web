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
 * {@link MessageDigest#getInstance(String)} is declared to fail for an algorithm the platform does not know, which
 * neither SHA-256 nor MD5 can be. Answering that here is what keeps the callers reading as the hashing they are, rather
 * than each carrying a catch block for something that cannot happen.
 */
final class Digests {

    private Digests() {
    }

    /** A fresh SHA-256 digest. */
    static MessageDigest sha256() {
        return of("SHA-256");
    }

    /** A fresh digest for {@code algorithm}. */
    static MessageDigest of(final String algorithm) {
        try {
            return MessageDigest.getInstance(algorithm);
        }
        catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException(algorithm + " is not available", unavailable);
        }
    }
}
