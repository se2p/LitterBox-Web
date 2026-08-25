/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/* SPDX-License-Identifier: EUPL-1.2 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ShareTokenGeneratorTest {

    @Test
    void generatesOpaqueTokensWithAtLeast128Bits() {
        final String token = new ShareTokenGenerator().nextToken();

        assertThat(token).hasSizeGreaterThanOrEqualTo(22);
        assertThat(token).matches("[A-Za-z0-9_-]+");
    }
}
