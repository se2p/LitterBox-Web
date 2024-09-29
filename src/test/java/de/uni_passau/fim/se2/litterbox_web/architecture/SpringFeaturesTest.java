/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.lang.ArchRule;

class SpringFeaturesTest extends ArchitectureTest {

    @Test
    void doNotUseRestTemplate() {
        final ArchRule rule = noClasses()
            .should()
            .dependOnClassesThat()
            .haveFullyQualifiedName("org.springframework.web.client.RestTemplate")
            .because("the non-blocking WebClient API (or our ExternalApiConnector utility) should be used instead");

        rule.check(allClasses);
    }
}
