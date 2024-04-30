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
