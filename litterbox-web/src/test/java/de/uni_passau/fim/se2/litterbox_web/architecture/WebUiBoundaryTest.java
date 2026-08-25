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
import static com.tngtech.archunit.lang.conditions.ArchPredicates.are;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;
import org.springframework.test.context.ActiveProfiles;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

import de.uni_passau.fim.se2.litterbox_web.web_ui.support.WebUiProfiles;

/**
 * The web UI keeps to itself.
 *
 * <p>
 * Everything the site needs lives in {@code web_ui}: its endpoints, the tables its submissions are kept in, the queues
 * those endpoints are served from. That machinery is shaped by what one browser session needs, and the rest of this
 * service answers machines that need none of it — so the dependency runs one way, outwards. {@code web_ui} may use the
 * analysers and the shared services; nothing may use {@code web_ui}.
 *
 * <p>
 * Written down because it was already broken once. A bounded executor built to keep one page's request queue short was
 * put in front of the converter, the linter, the tokenizer, and the question generator as well, where a full queue
 * meant a rejected request for callers that would happily have waited.
 */
class WebUiBoundaryTest extends ArchitectureTest {

    private static final String WEB_UI = "de.uni_passau.fim.se2.litterbox_web.web_ui..";

    /**
     * The architecture tests are the exception: a rule about a package is written by reading it, and these are the only
     * classes here that read one without being part of it.
     */
    private static final String ARCHITECTURE = "de.uni_passau.fim.se2.litterbox_web.architecture..";

    @Test
    void nothingOutsideTheWebUiPackageDependsOnIt() {
        final ArchRule rule = noClasses()
            .that().resideOutsideOfPackage(WEB_UI)
            .should().dependOnClassesThat().resideInAPackage(WEB_UI)
            .because(
                "code that serves the web UI belongs to the web UI: everything else here answers machines that "
                    + "neither render its pages nor share its request queue"
            );

        rule.check(withoutTheArchitectureTests(productionClasses));
    }

    /**
     * Tests follow their subject, so a test outside {@code web_ui} reaching into it is the same crossing as its
     * production counterpart — and the crossing a fixture is written for is usually the one that arrives next.
     */
    @Test
    void noTestOutsideTheWebUiPackageDependsOnItEither() {
        final ArchRule rule = noClasses()
            .that().resideOutsideOfPackage(WEB_UI)
            .should().dependOnClassesThat().resideInAPackage(WEB_UI)
            .because("a test of the web UI, and any fixture it needs, belongs beside what it is testing");

        rule.check(withoutTheArchitectureTests(testClasses));
    }

    /**
     * A dependency rule reads imports, and a profile name is a string. Moving {@code PUBLIC_WEB} into {@code web_ui}
     * put every class that names it through the two rules above — but only for as long as it is named through the
     * constant, and typing {@code "public-web"} costs nobody an import. What the profile gates is the site's own beans,
     * so a class outside {@code web_ui} switched on by it is web UI that has been left somewhere else.
     */
    @Test
    void nothingOutsideTheWebUiPackageIsGatedOnItsProfile() {
        final ArchRule rule = noClasses()
            .that().resideOutsideOfPackage(WEB_UI)
            .should(nameThePublicWebProfile())
            .because("the profile that switches the site on has nothing to switch on outside the site's own package");

        rule.check(withoutTheArchitectureTests(allClasses));
    }

    private static ArchCondition<JavaClass> nameThePublicWebProfile() {
        return new ArchCondition<>("name the \"" + WebUiProfiles.PUBLIC_WEB + "\" profile") {

            @Override
            public void check(final JavaClass item, final ConditionEvents events) {
                final boolean gated = profilesNamedBy(item).contains(WebUiProfiles.PUBLIC_WEB);
                events.add(
                    new SimpleConditionEvent(
                        item, gated, item.getName() + " names the " + WebUiProfiles.PUBLIC_WEB + " profile"
                    )
                );
            }
        };
    }

    private static Set<String> profilesNamedBy(final JavaClass item) {
        final Set<String> named = new LinkedHashSet<>();
        item.tryGetAnnotationOfType(Profile.class)
            .ifPresent(profile -> named.addAll(Arrays.asList(profile.value())));
        item.tryGetAnnotationOfType(ActiveProfiles.class)
            .ifPresent(active -> {
                named.addAll(Arrays.asList(active.value()));
                named.addAll(Arrays.asList(active.profiles()));
            });
        return named;
    }

    private static JavaClasses withoutTheArchitectureTests(final JavaClasses classes) {
        return classes.that(are(not(resideInAPackage(ARCHITECTURE))));
    }
}
