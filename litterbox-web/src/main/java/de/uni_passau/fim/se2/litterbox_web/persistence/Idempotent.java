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

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Writes whose only way of failing is that the same fact is already recorded.
 *
 * <p>
 * Naming the one error that is acceptable is what leaves the rest visible: a blanket {@code INSERT IGNORE} would let a
 * missing analysis or a missing artifact go by as quietly as a duplicate, and tell the caller the row was written.
 *
 * <p>
 * Not for use inside a transaction the caller means to carry on with. The failed statement leaves that transaction
 * marked for rollback, so swallowing the exception only postpones it; a caller in that position wants the retry in a
 * fresh transaction that can see what the winner wrote.
 */
final class Idempotent {

    private Idempotent() {
    }

    static void write(final Runnable statement) {
        try {
            statement.run();
        }
        catch (DataIntegrityViolationException refused) {
            // A repeated key is what this asked for; anything else the database refused is news.
            if (!repeatedKey(refused)) {
                throw refused;
            }
        }
    }

    /**
     * Whether the database refused the statement over a key it already holds.
     *
     * <p>
     * Asked of Hibernate rather than of the exception's class, because a violated foreign key arrives as the same
     * Spring exception and is the very thing worth hearing about. Hibernate keeps the distinction the database drew.
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
