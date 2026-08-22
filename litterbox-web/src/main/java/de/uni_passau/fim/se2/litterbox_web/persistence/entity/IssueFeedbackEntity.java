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

/** Maps the {@code issue_feedback} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "issue_feedback")
@IdClass(IssueFeedbackEntity.Key.class)
public class IssueFeedbackEntity {

    @Id
    @Column(name = "analysis_id")
    private long analysisId;

    @Id
    @Column(name = "finder_name")
    private String finderName;

    /** The columns that together name a row. */
    public static final class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private long analysisId;
        private String finderName;

        public Key() {
        }

        public Key(final long analysisId, final String finderName) {
            this.analysisId = analysisId;
            this.finderName = finderName;
        }

        @Override
        public boolean equals(final Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return analysisId == key.analysisId
                && Objects.equals(finderName, key.finderName);
        }

        @Override
        public int hashCode() {
            return Objects.hash(analysisId, finderName);
        }
    }
}
