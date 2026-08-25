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

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Assets;

/**
 * Costumes are learner-supplied content that the service later serves back to a browser, and {@link AssetRepository} is
 * where that content is read before it is kept. A second way into the table would not be a second way to write a row,
 * it would be a way to serve a document nobody looked at, so what is asserted here is that there is no second way.
 */
class AssetWriteBoundaryTest extends ArchitectureTest {

    /**
     * Spring Data builds whatever the interface declares, so the interface is the permission. Extending
     * {@code JpaRepository} would have granted every one of these without anybody writing them down.
     * {@code getReferenceById} is here with the rest because a managed entity is written back when it is changed, so
     * handing one out is handing out a write.
     */
    private static final Set<String> INHERITED_WRITE_PATHS = Set.of(
        "save", "saveAll", "saveAndFlush", "saveAllAndFlush", "delete", "deleteAll", "deleteById",
        "deleteAllById", "deleteAllInBatch", "deleteAllByIdInBatch", "flush", "getReferenceById"
    );

    @Test
    void theAssetTableOffersNothingBesideItsTwoStatements() {
        assertThat(Assets.class.getMethods())
            .extracting(Method::getName)
            .containsExactlyInAnyOrder("store", "findForSubmission");
    }

    @Test
    void theAssetTableInheritsNoWayToWriteWithoutBeingRead() {
        final Set<String> offered = Arrays.stream(Assets.class.getMethods())
            .map(Method::getName)
            .collect(Collectors.toUnmodifiableSet());

        assertThat(offered).doesNotContainAnyElementsOf(INHERITED_WRITE_PATHS);
    }

    /**
     * The check runs in {@code AssetRepository.validate}, so a caller reaching the table around it is a caller the
     * check never saw. Reads have the same shape and no reason to be spread either, so the whole interface is kept to
     * one owner rather than only its writing half.
     */
    @Test
    void onlyTheAssetRepositoryTouchesTheAssetTable() {
        noClasses().that()
            .doNotBelongToAnyOf(AssetRepository.class)
            .should()
            .dependOnClassesThat()
            .belongToAnyOf(Assets.class)
            .because("every asset write has to pass the SandboxedSvg admission check AssetRepository runs first")
            .check(productionClasses);
    }
}
