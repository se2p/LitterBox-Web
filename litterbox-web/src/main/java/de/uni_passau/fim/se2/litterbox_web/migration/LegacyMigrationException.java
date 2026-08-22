/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.util.List;

public class LegacyMigrationException extends RuntimeException {

    private final List<Diagnostic> diagnostics;

    public LegacyMigrationException(final String message, final List<Diagnostic> diagnostics) {
        super(message);
        this.diagnostics = List.copyOf(diagnostics);
    }

    public LegacyMigrationException(final String message, final Throwable cause) {
        super(message, cause);
        diagnostics = List.of();
    }

    /**
     * For a refusal that something else caused. The cause is kept so that what the operating system said is in the log
     * beside the diagnostic: a refusal naming only itself leaves an operator with a whole machine to search.
     */
    public LegacyMigrationException(
        final String message,
        final List<Diagnostic> diagnostics,
        final Throwable cause
    ) {
        super(message, cause);
        this.diagnostics = List.copyOf(diagnostics);
    }

    /** Returns aggregate diagnostics that never contain source row values. */
    public List<Diagnostic> diagnostics() {
        return diagnostics;
    }

    public record Diagnostic(String code, String table, String column, String detail, long count) {
    }
}
