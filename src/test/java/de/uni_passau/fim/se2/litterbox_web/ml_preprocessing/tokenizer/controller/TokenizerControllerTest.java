/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.model.MaskedTokenizationRequest;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;

class TokenizerControllerTest extends LitterboxWebIntegrationTest {

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void maskExpression() throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final MaskedTokenizationRequest request = new MaskedTokenizationRequest(programJson, "6f:0*dekkAiR0o@/B1P]");

        final List<String> tokens = requestUtilService.postWithResponseBodyList(
            "/ml/masking-tokenizer/tokenize/complete-program/expression-masking", request, String.class, HttpStatus.OK
        );

        assertThat(tokens)
            .hasSize(9)
            .contains("[MASK]")
            .doesNotContain("operator_random");
    }

    @Test
    void maskFixedNodeOption() throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final MaskedTokenizationRequest request = new MaskedTokenizationRequest(programJson, "cB8O}wnQ}MC!R_XxB24.");

        final List<String> tokens = requestUtilService.postWithResponseBodyList(
            "/ml/masking-tokenizer/tokenize/complete-program/fixed-option-masking", request, String.class, HttpStatus.OK
        );

        assertThat(tokens)
            .hasSize(12)
            .contains("[MASK]")
            .doesNotContain("COLOR");
    }

    @Test
    void maskStatement() throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final MaskedTokenizationRequest request = new MaskedTokenizationRequest(programJson, "6f:0*dekkAiR0o@/B1P]");

        final List<String> tokens = requestUtilService.postWithResponseBodyList(
            "/ml/masking-tokenizer/tokenize/statement-level/statement-masking", request, String.class, HttpStatus.OK
        );

        assertThat(tokens)
            .hasSize(7)
            .contains("[MASK]")
            .doesNotContain("motion_movesteps");
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "/ml/masking-tokenizer/tokenize/complete-program/expression-masking",
            "/ml/masking-tokenizer/tokenize/complete-program/fixed-option-masking",
            "/ml/masking-tokenizer/tokenize/statement-level/statement-masking"
        }
    )
    void emptyResultIfTokenNotFound(final String tokenizingStrategy) throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final MaskedTokenizationRequest request = new MaskedTokenizationRequest(programJson, "non-existing-block");

        final List<String> tokens = requestUtilService.postWithResponseBodyList(
            tokenizingStrategy, request, String.class, HttpStatus.OK
        );

        assertThat(tokens).isEmpty();
    }
}
