/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SingleProjectIntakeUrlTest {

    @Test
    void acceptsOnlyCanonicalScratchProjectUrls() {
        assertThat(SingleProjectIntake.scratchProjectId("https://scratch.mit.edu/projects/23"))
            .isEqualTo("23");
        assertThat(SingleProjectIntake.scratchProjectId("https://www.scratch.mit.edu/projects/23/"))
            .isEqualTo("23");

        assertThat(SingleProjectIntake.scratchProjectId("http://scratch.mit.edu/projects/23")).isNull();
        assertThat(SingleProjectIntake.scratchProjectId("https://scratch.mit.edu/projects/23?x=1"))
            .isNull();
        assertThat(SingleProjectIntake.scratchProjectId("https://scratch.mit.edu/projects/23/editor"))
            .isNull();
        assertThat(SingleProjectIntake.scratchProjectId("https://scratch.mit.edu.evil/projects/23"))
            .isNull();
        assertThat(SingleProjectIntake.scratchProjectId("https://scratch.mit.edu:444/projects/23"))
            .isNull();
        assertThat(SingleProjectIntake.scratchProjectId("https://user@scratch.mit.edu/projects/23"))
            .isNull();
    }
}
