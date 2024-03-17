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
package de.uni_passau.fim.se2.litterbox_web.architecture;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.INTERFACES;
import static com.tngtech.archunit.lang.conditions.ArchPredicates.are;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;

import org.junit.jupiter.api.Test;
import org.slf4j.Logger;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.GeneralCodingRules;

class LoggerTest extends ArchitectureTest {

    @Test
    void forbidJavaLoggerImport() {
        final ArchRule rule = GeneralCodingRules.NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING
            .because("the slf4j Logger and LoggerFactory should be used instead");
        rule.check(allClasses);
    }

    @Test
    void testCorrectLoggerFields() {
        final ArchRule namingRule = fields().that().haveRawType(Logger.class).should().haveName("log");
        final ArchRule modifiersRule = fields().that().haveRawType(Logger.class)
            .should().bePrivate()
            .andShould().beFinal()
            .andShould().beStatic();

        namingRule.check(allClasses);

        // Interfaces can only contain public attributes
        final JavaClasses modifierExclusions = allClasses.that(are(not(INTERFACES)));
        modifiersRule.check(modifierExclusions);
    }
}
