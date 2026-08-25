/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** Maps the {@code analysis_metric} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "analysis_metric")
@IdClass(AnalysisMetricEntity.Key.class)
public class AnalysisMetricEntity {

    @Id
    @Column(name = "analysis_id")
    private long analysisId;

    @Id
    @Column(name = "name")
    private String name;

    @Column(name = "value")
    private double value;

    public long getAnalysisId() {
        return analysisId;
    }

    public void setAnalysisId(final long analysisId) {
        this.analysisId = analysisId;
    }

    public String getName() {
        return name;
    }

    public void setName(final String name) {
        this.name = name;
    }

    public double getValue() {
        return value;
    }

    public void setValue(final double value) {
        this.value = value;
    }

    /** The columns that together name a row. */
    public static final class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private long analysisId;
        private String name;

        public Key() {
        }

        public Key(final long analysisId, final String name) {
            this.analysisId = analysisId;
            this.name = name;
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
                && Objects.equals(name, key.name);
        }

        @Override
        public int hashCode() {
            return Objects.hash(analysisId, name);
        }
    }
}
