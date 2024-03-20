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
import static com.tngtech.archunit.core.domain.JavaCall.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import java.nio.file.Files;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.GeneralCodingRules;

import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.shared.ScratchProgramConverter;
import de.uni_passau.fim.se2.litterbox_web.shared.TemporaryFileService;

class GeneralRulesTest extends ArchitectureTest {

    @Test
    void doNotUseStandardStreams() {
        GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS.check(allClasses);
    }

    @Test
    void noCollectorsToList() {
        final ArchRule toListUsage = noClasses()
            .should()
            .callMethod(Collectors.class, "toList")
            .because("you should use .toList() or .collect(Collectors.toCollection(ArrayList::new)) instead");

        toListUsage.check(allClasses);
    }

    @Test
    void noDirectScratchParserUsage() {
        final ArchRule parseUsage = noClasses()
            .should().callMethodWhere(target(owner(assignableTo(Scratch3Parser.class))))
            .because("the Scratch3ParserService or the ScratchProgramConverter should be used instead");

        final JavaClasses target = productionClasses.that(
            not(
                assignableTo(Scratch3ParserService.class)
                    .or(assignableTo(ScratchProgramConverter.SerializeConverter.class))
                    .or(assignableTo(ScratchProgramConverter.DeserializeConverter.class))
            )
        );
        parseUsage.check(target);
    }

    @Test
    void noTempFileCreation() {
        final ArchRule rule = noClasses()
            .should().callMethod(Files.class, "createTempFile")
            .orShould().callMethod(Files.class, "createTempDirectory")
            .because("the TemporaryFileService should be used");

        final JavaClasses target = productionClasses.that(not(assignableTo(TemporaryFileService.class)));
        rule.check(target);
    }
}
