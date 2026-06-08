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

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class QlcControllerIntegrationTest extends LitterboxWebIntegrationTest {

    private static final String DEFAULT_FIXTURE = "tokenizingTest.json";
    private static final String GENERATE_URL = "/qlc/generate";
    private static final String EN = "en";

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void generateQuestionsReturnsNonNullList() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(program);

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).isNotNull();
    }

    @Test
    void generatedQuestionsHaveRequiredFields() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(program);

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).allSatisfy(q -> {
            assertThat(q.name()).isNotBlank();
            assertThat(q.translatedFinderName()).isNotBlank();
            assertThat(q.questionText()).isNotBlank();
            assertThat(q.sprite()).isNotBlank();
            assertThat(q.type()).isNotNull();
            assertThat(q.programDimension()).isNotNull();
            assertThat(q.scopeOfFocus()).isNotNull();
        });
    }

    @Test
    void multipleChoiceQuestionsHaveChoices() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(program);

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions)
            .filteredOn(q -> QuestionType.MULTIPLE_CHOICE.equals(q.type()))
            .allSatisfy(q -> assertThat(q.choices()).isNotEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = { EN, "de" })
    void languageSelectionWorks(final String language) throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(language, program, null, null, null, 0, false, 0, false, null);

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).isNotNull();
    }

    @Test
    void finderFilterRestrictsResults() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest allRequest = new QlcRequest(program);
        final QlcRequest filteredRequest = new QlcRequest(
            EN, program, "ScriptsInProgram", null, null, 0, false, 0, false, null
        );

        final List<QuestionDTO> allQuestions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, allRequest, QuestionDTO.class, HttpStatus.OK
        );
        final List<QuestionDTO> filtered = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, filteredRequest, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(filtered).allMatch(q -> "ScriptsInProgram".equals(q.name()));
        assertThat(filtered.size()).isLessThanOrEqualTo(allQuestions.size());
    }

    @Test
    void dimensionFilterRestrictsResults() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(
            EN, program, null, Set.of(ProgramDimension.TEXT), null, 0, false, 0, false, null
        );

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).allMatch(q -> ProgramDimension.TEXT.equals(q.programDimension()));
    }

    @Test
    void scopeFilterRestrictsResults() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(
            EN, program, null, null, Set.of(ScopeOfFocus.ATOM), 0, false, 0, false, null
        );

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).allMatch(q -> ScopeOfFocus.ATOM.equals(q.scopeOfFocus()));
    }

    @Test
    void maxQuestionsLimitsResults() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final int max = 3;
        final QlcRequest request = new QlcRequest(
            EN, program, null, null, null, max, false, 0, false, null
        );

        final List<QuestionDTO> questions = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(questions).hasSizeLessThanOrEqualTo(max);
    }

    @Test
    void seedProducesReproducibleResults() throws Exception {
        final Program program = FixtureLoader.loadProgramFixture(DEFAULT_FIXTURE);
        final QlcRequest request = new QlcRequest(
            EN, program, null, null, null, 0, false, 0, true, 42L
        );

        final List<QuestionDTO> first = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );
        final List<QuestionDTO> second = requestUtilService.postWithResponseBodyList(
            GENERATE_URL, request, QuestionDTO.class, HttpStatus.OK
        );

        assertThat(first).containsExactlyElementsOf(second);
    }
}
