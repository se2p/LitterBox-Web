/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.qlc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;

class QlcDefensiveCopyTest {

    @Test
    void qlcRequestSnapshotsDimensionsAndScopes() {
        final ProgramDimension dimension = ProgramDimension.values()[0];
        final ScopeOfFocus scope = ScopeOfFocus.values()[0];
        final Set<ProgramDimension> dimensions = new LinkedHashSet<>(Set.of(dimension));
        final Set<ScopeOfFocus> scopes = new LinkedHashSet<>(Set.of(scope));
        final QlcRequest request = new QlcRequest(
            "en", null, null, dimensions, scopes, 1, false, 0, false, null
        );

        dimensions.clear();
        scopes.clear();
        assertThat(request.dimensions()).containsExactly(dimension);
        assertThat(request.scopes()).containsExactly(scope);
        assertThatThrownBy(() -> request.dimensions().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> request.scopes().clear()).isInstanceOf(UnsupportedOperationException.class);
        final QlcRequest emptyRequest = new QlcRequest((Program) null);
        assertThat(emptyRequest.dimensions()).isEmpty();
        assertThat(emptyRequest.scopes()).isEmpty();
    }

    @Test
    void questionChoicesAndAnswersAreSnapshots() {
        final List<String> choices = new ArrayList<>(List.of("choice"));
        final List<String> answers = new ArrayList<>(List.of("answer"));
        final QuestionDTO question = new QuestionDTO(
            1, null, null, null, null, null, null, null, null, choices, answers, null
        );

        choices.add("another choice");
        answers.add("another answer");
        assertThat(question.choices()).containsExactly("choice");
        assertThat(question.correctAnswers()).containsExactly("answer");
        assertThatThrownBy(() -> question.choices().add("new choice"))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> question.correctAnswers().add("new answer"))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThat(new QuestionDTO(1, null, null, null, null, null, null, null, null, null, null, null).choices())
            .isNull();
        assertThat(
            new QuestionDTO(1, null, null, null, null, null, null, null, null, null, null, null).correctAnswers()
        )
            .isNull();
    }

}
