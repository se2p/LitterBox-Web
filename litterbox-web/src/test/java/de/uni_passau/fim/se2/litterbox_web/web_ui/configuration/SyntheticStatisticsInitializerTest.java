/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class SyntheticStatisticsInitializerTest {

    @Test
    void leavesAnExistingProjectionUntouched() {
        final JdbcTemplate database = mock(JdbcTemplate.class);
        when(database.queryForObject("SELECT COUNT(*) FROM statistics_total", Long.class)).thenReturn(1L);

        new SyntheticStatisticsInitializer(database, 50).run(null);

        verify(database).queryForObject("SELECT COUNT(*) FROM statistics_total", Long.class);
        verifyNoMoreInteractions(database);
    }

    @Test
    void scalesTheDemoPopulationAboveThePublicationThreshold() {
        final JdbcTemplate database = mock(JdbcTemplate.class);
        when(database.queryForObject("SELECT COUNT(*) FROM statistics_total", Long.class)).thenReturn(0L);

        new SyntheticStatisticsInitializer(database, 50).run(null);

        verify(database).update(
            eq(
                "INSERT INTO statistics_total "
                    + "(singleton, projects, finding_projects, block_category_projects, blocks, scripts, sprites, "
                    + "synthetic) VALUES (1, ?, ?, ?, ?, ?, ?, TRUE)"
            ),
            eq(60L), eq(60L), eq(60L), eq(8_200L), eq(710L), eq(290L)
        );
    }
}
