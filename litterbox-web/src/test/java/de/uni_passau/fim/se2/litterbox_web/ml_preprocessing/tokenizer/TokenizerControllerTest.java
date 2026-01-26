/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
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
            "/ml/masking-tokenizer/tokenize/complete-program/block-masking", request, String.class, HttpStatus.OK
        );

        assertThat(tokens)
            .hasSize(11)
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
            .hasSize(20)
            .contains("[MASK]")
            .doesNotContain("COLOR");
    }

    @Test
    void maskStatement() throws Exception {
        final Program programJson = FixtureLoader.loadProgramFixture("tokenizingTest.json");
        final MaskedTokenizationRequest request = new MaskedTokenizationRequest(programJson, "6f:0*dekkAiR0o@/B1P]");

        final List<String> tokens = requestUtilService.postWithResponseBodyList(
            "/ml/masking-tokenizer/tokenize/statement-level/block-masking", request, String.class, HttpStatus.OK
        );

        assertThat(tokens)
            .hasSize(7)
            .contains("[MASK]")
            .doesNotContain("motion_movesteps");
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "/ml/masking-tokenizer/tokenize/complete-program/block-masking",
            "/ml/masking-tokenizer/tokenize/complete-program/fixed-option-masking",
            "/ml/masking-tokenizer/tokenize/statement-level/block-masking"
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
