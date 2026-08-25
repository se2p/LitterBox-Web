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

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Runs an insert that is allowed to fail if the row is already there, and only then.
 *
 * <p>
 * Used for the writes that two concurrent requests may both attempt — queueing a job for a studio, linking an asset to
 * an analysis — where a unique key in the schema decides the race and the loser has nothing left to do.
 *
 * <p>
 * {@code INSERT IGNORE} would be shorter but also swallows a missing analysis or a missing artifact and reports the row
 * as written, so the duplicate key is picked out specifically and everything else is rethrown.
 *
 * <p>
 * Not safe to call inside a transaction the caller intends to continue: the failed statement marks that transaction
 * rollback-only, so catching the exception here only defers the failure. Callers in that position retry in a fresh
 * transaction, which can also see what the winner wrote.
 */
final class Idempotent {

    private Idempotent() {
    }

    static void write(final Runnable statement) {
        try {
            statement.run();
        }
        catch (DataIntegrityViolationException refused) {
            if (!repeatedKey(refused)) {
                throw refused;
            }
        }
    }

    /**
     * Whether the database refused the statement over a key it already holds.
     *
     * <p>
     * Asked of Hibernate rather than of the Spring exception's type, because a violated foreign key arrives as the same
     * {@link DataIntegrityViolationException} and must not be swallowed. Hibernate keeps the distinction the database
     * drew.
     */
    private static boolean repeatedKey(final Throwable refusal) {
        for (Throwable cause = refusal; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                return violation.getKind() == ConstraintViolationException.ConstraintKind.UNIQUE;
            }
            if (cause.getCause() == cause) {
                return false;
            }
        }
        return false;
    }
}
