/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class CodeReadabilityRequestTest {

    private static final String SVG = "svg";

    @Test
    void codeReadabilityTokensSnapshotNestedLists() {
        final List<String> row = new ArrayList<>(List.of("token"));
        final List<List<String>> tokens = new ArrayList<>(List.of(row));
        tokens.add(null);
        final CodeReadabilityService.CodeReadabilityRequest request = new CodeReadabilityService.CodeReadabilityRequest(
            tokens, SVG, null
        );

        row.add("changed");
        tokens.clear();
        assertThat(request.tokens()).containsExactly(List.of("token"), null);
        assertThatThrownBy(() -> request.tokens().add(List.of("new row")))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> request.tokens().get(0).add("new token"))
            .isInstanceOf(UnsupportedOperationException.class);
        assertThat(new CodeReadabilityService.CodeReadabilityRequest(null, SVG, null).tokens()).isNull();
    }

}
