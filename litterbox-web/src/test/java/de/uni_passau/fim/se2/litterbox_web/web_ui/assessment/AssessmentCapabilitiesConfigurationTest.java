/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.assessment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AssessmentCapabilitiesConfigurationTest {

    @Test
    void refusesATitleLengthWiderThanItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxTitleLength(256);

        assertThatThrownBy(configuration::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acceptsATitleLengthExactlyAsWideAsItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxTitleLength(255);

        assertThatCode(configuration::validate).doesNotThrowAnyException();
    }

    @Test
    void refusesAnInstructionsLengthWiderThanItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxInstructionsLength(2001);

        assertThatThrownBy(configuration::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acceptsAnInstructionsLengthExactlyAsWideAsItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxInstructionsLength(2000);

        assertThatCode(configuration::validate).doesNotThrowAnyException();
    }

    @Test
    void refusesAnAnswerLengthWiderThanItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxAnswerLength(501);
        configuration.setMaxOptionLength(501);

        assertThatThrownBy(configuration::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acceptsAnAnswerLengthExactlyAsWideAsItsColumn() {
        final AssessmentCapabilitiesConfiguration configuration = new AssessmentCapabilitiesConfiguration();
        configuration.setMaxAnswerLength(500);

        assertThatCode(configuration::validate).doesNotThrowAnyException();
    }
}
