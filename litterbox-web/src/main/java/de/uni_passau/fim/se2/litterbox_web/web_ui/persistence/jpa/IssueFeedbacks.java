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

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.IssueFeedbackEntity;

public interface IssueFeedbacks extends JpaRepository<IssueFeedbackEntity, IssueFeedbackEntity.Key> {

    /**
     * A reaction replaces whatever the same reader said before. Reading first and then choosing between an insert and
     * an update is two decisions where the database offers one.
     *
     * @param analysisId analysis identifier
     * @param finder     finder name
     * @param reaction   submitted reaction
     */
    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO issue_feedback (analysis_id, finder_name, reaction) VALUES (:analysisId, :finder, "
            + ":reaction) ON DUPLICATE KEY UPDATE reaction = :reaction, updated_at = CURRENT_TIMESTAMP(6)",
        nativeQuery = true
    )
    void upsert(
        @Param("analysisId") long analysisId, @Param("finder") String finder, @Param("reaction") String reaction
    );
}
