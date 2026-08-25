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

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

/**
 * This project takes no row locks.
 *
 * <p>
 * It used to. Claiming a job locked every job of a submission while it looked for work, which let only one project of a
 * class set be analysed at a time; the rest guarded reading a count and writing it back. Both are now written so that
 * the database decides the outcome of a single statement, and a writer that loses reads again.
 *
 * <p>
 * The reason to hold that line by test rather than by intention is that a lock is easy to add and its cost is invisible
 * until something is slow under load, which is the worst moment to find out. If a case ever genuinely needs one, adding
 * it here alongside the reason is the deliberate act this asks for.
 */
class NoPessimisticLockingTest {

    private static final List<String> LOCKING_CLAUSES = List.of("for update", "lock in share mode");

    @Test
    void noMainSourceTakesARowLock() throws IOException {
        final Path sources = Path.of("src/main/java");
        try (Stream<Path> java = Files.walk(sources)) {
            final List<String> offenders = java
                .filter(path -> path.toString().endsWith(".java"))
                .filter(NoPessimisticLockingTest::takesALock)
                .map(sources::relativize)
                .map(Path::toString)
                .sorted()
                .toList();

            assertThat(offenders)
                .as(
                    "These take a row lock. The claim path and the submission counters were deliberately written "
                        + "without one; see SubmissionProgress for how a count is written safely instead."
                )
                .isEmpty();
        }
    }

    @Test
    void theMigrationsDoNotAskForOneEither() throws IOException {
        final Path migrations = Path.of("src/main/resources/db/migration");
        try (Stream<Path> sql = Files.walk(migrations)) {
            assertThat(
                sql.filter(path -> path.toString().endsWith(".sql")).filter(NoPessimisticLockingTest::takesALock)
            )
                .isEmpty();
        }
    }

    private static boolean takesALock(final Path path) {
        try {
            final String text = Files.readString(path, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
            return LOCKING_CLAUSES.stream().anyMatch(text::contains);
        }
        catch (IOException error) {
            throw new IllegalStateException("Could not read " + path, error);
        }
    }
}
