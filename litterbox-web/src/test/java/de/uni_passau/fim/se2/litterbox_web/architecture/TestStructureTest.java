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

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.simpleName;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.simpleNameContaining;
import static com.tngtech.archunit.core.domain.properties.HasModifiers.Predicates.modifier;
import static com.tngtech.archunit.lang.conditions.ArchPredicates.are;
import static com.tngtech.archunit.lang.conditions.ArchPredicates.have;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;

import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.lang.ArchRule;

class TestStructureTest extends ArchitectureTest {

    @Test
    void noJUnit4Imports() {
        final ArchRule noJUnit4Imports = noClasses().should()
            .dependOnClassesThat().resideInAPackage("org.junit")
            .because("JUnit 4 imports should be replaced by JUnit 5 org.junit.jupiter.api");
        noJUnit4Imports.check(testClasses);
    }

    @Test
    void noPublicTestClasses() {
        final ArchRule noPublicTestClasses = noClasses()
            .that().haveNameMatching(".*Test")
            .and(have(not(modifier(JavaModifier.ABSTRACT))))
            .should().bePublic()
            .because("JUnit 5 does not require test classes to be public");
        noPublicTestClasses.check(testClasses.that(are(not(simpleNameContaining("Abstract")))));
    }

    @Test
    void noPublicTestMethods() {
        final ArchRule noPublicTests = noMethods()
            .that().areAnnotatedWith(Test.class)
            .or().areAnnotatedWith(ParameterizedTest.class)
            .or().areAnnotatedWith(BeforeEach.class)
            .or().areAnnotatedWith(BeforeAll.class)
            .or().areAnnotatedWith(AfterEach.class)
            .or().areAnnotatedWith(AfterAll.class)
            .should().bePublic()
            .because("JUnit 5 does not require test methods to be public");
        noPublicTests.check(testClasses);
    }

    @Test
    void onlyAllowAssertJAssertThat() {
        final ArchRule noHamcrest = noClasses().should()
            .dependOnClassesThat().haveNameMatching("org.hamcrest")
            .because("only AssertJ assertThat should be used");
        noHamcrest.check(testClasses);

        final ArchRule onlyAssertions = noClasses().should()
            .dependOnClassesThat(
                resideInAPackage("org.assertj.core.api")
                    .and(have(simpleNameContaining("Assertions")))
                    .and(not(have(simpleName("Assertions"))))
            )
            .because("only the base org.assertj.core.api.Assertions.assertThat should be used");
        onlyAssertions.check(testClasses);
    }
}
