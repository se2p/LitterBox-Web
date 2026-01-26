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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeAll;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

abstract class ArchitectureTest {

    private static final String LITTERBOX_WEB_PACKAGE = "de.uni_passau.fim.se2.litterbox_web";

    protected static JavaClasses allClasses;
    protected static JavaClasses productionClasses;
    protected static JavaClasses testClasses;

    @BeforeAll
    static void loadClasses() {
        if (allClasses == null) {
            allClasses = new ClassFileImporter().importPackages(LITTERBOX_WEB_PACKAGE);
            productionClasses = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages(LITTERBOX_WEB_PACKAGE);
            testClasses = new ClassFileImporter().withImportOption(new ImportOption.OnlyIncludeTests())
                .importPackages(LITTERBOX_WEB_PACKAGE);
        }

        ensureClassesFound();
        ensureAllClassesFound();
    }

    private static void ensureClassesFound() {
        assertThat(allClasses).isNotEmpty();
        assertThat(productionClasses).isNotEmpty();
        assertThat(testClasses).isNotEmpty();
    }

    private static void ensureAllClassesFound() {
        assertThat(productionClasses.size() + testClasses.size()).isEqualTo(allClasses.size());
    }
}
