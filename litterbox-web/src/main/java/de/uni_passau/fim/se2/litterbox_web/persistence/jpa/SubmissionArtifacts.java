/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.jpa;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.SubmissionArtifactEntity;

public interface SubmissionArtifacts
    extends JpaRepository<SubmissionArtifactEntity, SubmissionArtifactEntity.Key> {

    /**
     * Links a submission to an artifact it was made from. The primary key is exactly the three columns, so the same
     * fact stated twice is refused as a repeated key and callers outside a transaction pass over it.
     *
     * <p>
     * Not an {@code INSERT IGNORE}, which passes over an artifact or a submission that does not exist just as quietly
     * and reports the link as made. Nor a condition asking whether the row is already there: reading the table it
     * inserts into makes the statement take shared locks across the index it read, and sixteen submissions of one
     * shared artifact deadlock on the gap they all have to insert into.
     */
    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO submission_artifact (submission_id, artifact_id, role) "
            + "VALUES (:submissionId, :artifactId, :role)",
        nativeQuery = true
    )
    void link(
        @Param("submissionId") long submissionId, @Param("artifactId") long artifactId, @Param("role") String role
    );

    /** The artifact a submission was made from under the given role, if one has been recorded for it yet. */
    @Query(
        value = "SELECT artifact_id FROM submission_artifact WHERE submission_id = :submissionId AND role = :role "
            + "ORDER BY artifact_id LIMIT 1",
        nativeQuery = true
    )
    Optional<Long> findArtifactId(@Param("submissionId") long submissionId, @Param("role") String role);
}
