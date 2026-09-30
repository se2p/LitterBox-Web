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

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssessmentAttemptEntity;

public interface AssessmentAttempts extends JpaRepository<AssessmentAttemptEntity, Long> {

    Optional<AssessmentAttemptEntity> findByPublicToken(String publicToken);

    /**
     * Removes only attempts with no answers.
     *
     * @param assessmentId the assessment whose unanswered attempts are removed
     * @return the number of attempts removed
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "DELETE FROM assessment_attempt WHERE assessment_id = :assessmentId AND NOT EXISTS ("
            + "SELECT 1 FROM assessment_answer WHERE assessment_answer.attempt_id = assessment_attempt.id)",
        nativeQuery = true
    )
    int deleteUnanswered(@Param("assessmentId") long assessmentId);
}
