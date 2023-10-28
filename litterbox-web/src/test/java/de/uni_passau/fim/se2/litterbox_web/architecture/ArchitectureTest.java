/*
 * Copyright (C) 2023 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
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
package de.uni_passau.fim.se2.litterbox_web.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

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
