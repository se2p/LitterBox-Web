/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

/**
 * A stored report is parsed whole, into memory, on every read of the submission it belongs to, so how large one may be
 * is a property of the service rather than of whoever wrote the row. {@code single_project} refuses to produce a report
 * over its ceiling; the legacy migration must refuse to import one, or the import quietly buys rows that cannot be
 * opened.
 *
 * <p>
 * The two modules cannot share the number: {@code migration} may only depend on {@code persistence}, so it cannot read
 * what {@code single_project} holds itself to, and the ceiling is written out in both. Two numbers that have to agree
 * drift unless something fails when they do — this is that something. Both are read reflectively because each class is
 * package-private to its own module, which is the arrangement being defended rather than an obstacle to it.
 */
class ReportCeilingTest {

    private static final String PRODUCER = "de.uni_passau.fim.se2.litterbox_web.single_project.SingleProjectReader";

    private static final String IMPORTER = "de.uni_passau.fim.se2.litterbox_web.migration.LegacyMigrationPlanner";

    @Test
    void importsNoLargerAReportThanTheServiceWillProduce() throws Exception {
        assertThat(ceiling(IMPORTER))
            .as("%s imports exactly what %s is willing to hold in memory", IMPORTER, PRODUCER)
            .isEqualTo(ceiling(PRODUCER));
    }

    /** Both ceilings are positive, so that two classes having quietly lost the field cannot read as agreement. */
    @Test
    void findsACeilingOnBothSides() throws Exception {
        assertThat(ceiling(PRODUCER)).isPositive();
        assertThat(ceiling(IMPORTER)).isPositive();
    }

    private int ceiling(final String className) throws Exception {
        final Field field = Class.forName(className).getDeclaredField("MAX_REPORT_BYTES");
        field.setAccessible(true);
        return field.getInt(null);
    }
}
