/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.architecture;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebApplication;

class ModulithTest {

    private final ApplicationModules modules = ApplicationModules.of(LitterboxWebApplication.class);

    @Test
    void shouldBeCompliant() {
        modules.forEach(System.out::println);
        modules.verify();
    }

    /**
     * Generated documentation can be found in {@code target/spring-modulith-docs/}.
     */
    @Test
    void writeDocumentationSnippets() {
        new Documenter(modules)
            .writeModuleCanvases()
            .writeModulesAsPlantUml()
            .writeIndividualModulesAsPlantUml()
            .writeDocumentation();
    }
}
