/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.entity;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** Maps the {@code submission_artifact} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "submission_artifact")
@IdClass(SubmissionArtifactEntity.Key.class)
public class SubmissionArtifactEntity {

    @Id
    @Column(name = "submission_id")
    private long submissionId;

    @Id
    @Column(name = "artifact_id")
    private long artifactId;

    @Id
    @Column(name = "role")
    private String role;

    /** The columns that together name a row. */
    public static final class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private long submissionId;
        private long artifactId;
        private String role;

        public Key() {
        }

        public Key(final long submissionId, final long artifactId, final String role) {
            this.submissionId = submissionId;
            this.artifactId = artifactId;
            this.role = role;
        }

        @Override
        public boolean equals(final Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return submissionId == key.submissionId
                && artifactId == key.artifactId
                && Objects.equals(role, key.role);
        }

        @Override
        public int hashCode() {
            return Objects.hash(submissionId, artifactId, role);
        }
    }
}
