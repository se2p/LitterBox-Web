/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1.CapabilitiesDto;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentDtos;

class DefensiveCopyWebUiTest {

    @Test
    void capabilityCollectionsCannotBeChangedThroughInputOrGetter() {
        final List<String> locales = new ArrayList<>(List.of("en"));
        final Set<String> features = new LinkedHashSet<>(Set.of("qlc"));
        final CapabilitiesDto dto = new CapabilitiesDto(1, "test", locales, features, null);

        locales.add("de");
        features.add("metrics");
        assertThat(dto.supportedLocales()).containsExactly("en");
        assertThat(dto.enabledFeatures()).containsExactly("qlc");
        assertThatThrownBy(() -> dto.supportedLocales().add("de"))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> dto.enabledFeatures().add("metrics"))
            .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void assessmentQuestionInputSnapshotsOptionalCollections() {
        final List<String> options = new ArrayList<>(List.of("option"));
        final List<String> answers = new ArrayList<>(List.of("answer"));
        final AssessmentDtos.QuestionInput input = new AssessmentDtos.QuestionInput(
            AssessmentDtos.SOURCE_CUSTOM, null, null, null, options, null, answers
        );

        options.add("another option");
        answers.add("another answer");
        assertThat(input.options()).containsExactly("option");
        assertThat(input.correctAnswers()).containsExactly("answer");
        assertThatThrownBy(() -> input.options().add("new option"))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.correctAnswers().add("new answer"))
            .isInstanceOf(UnsupportedOperationException.class);
        final AssessmentDtos.QuestionInput withoutCollections = new AssessmentDtos.QuestionInput(
            AssessmentDtos.SOURCE_CUSTOM, null, null, null, null, null, null
        );
        assertThat(withoutCollections.options()).isNull();
        assertThat(withoutCollections.correctAnswers()).isNull();
    }
}
