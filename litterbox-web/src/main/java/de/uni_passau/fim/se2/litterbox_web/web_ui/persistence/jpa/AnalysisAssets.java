/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisAssetEntity;

public interface AnalysisAssets extends JpaRepository<AnalysisAssetEntity, AnalysisAssetEntity.Key> {

    /**
     * Records that an analysis uses an asset, which several of its costumes may say at once. The primary key is exactly
     * the three columns, so a repeat is refused as a repeated key and the caller passes over it.
     *
     * <p>
     * An {@code INSERT IGNORE} would have covered an asset that was never stored as well, leaving the caller to believe
     * a link exists to something that does not. A condition asking whether the row is already there would read the
     * table this inserts into, which is what {@link SubmissionArtifacts#link} explains the cost of.
     *
     * @param analysisId analysis identifier
     * @param sha256     asset digest
     * @param role       asset role within the analysis
     */
    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO analysis_asset (analysis_id, asset_sha256, role) VALUES (:analysisId, :sha256, :role)",
        nativeQuery = true
    )
    void link(@Param("analysisId") long analysisId, @Param("sha256") byte[] sha256, @Param("role") String role);
}
