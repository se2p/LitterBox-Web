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

/** Maps the {@code analysis_asset} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "analysis_asset")
@IdClass(AnalysisAssetEntity.Key.class)
public class AnalysisAssetEntity {

    @Id
    @Column(name = "analysis_id")
    private long analysisId;

    @Id
    @Column(
        name = "asset_sha256",
        columnDefinition = "BINARY(32)"
    )
    private byte[] assetSha256;

    @Id
    @Column(name = "role")
    private String role;

    /** The columns that together name a row. */
    public static final class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private long analysisId;
        private byte[] assetSha256;
        private String role;

        public Key() {
        }

        public Key(final long analysisId, final byte[] assetSha256, final String role) {
            this.analysisId = analysisId;
            this.assetSha256 = assetSha256;
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
            return analysisId == key.analysisId
                && java.util.Arrays.equals(assetSha256, key.assetSha256)
                && Objects.equals(role, key.role);
        }

        @Override
        public int hashCode() {
            return Objects.hash(analysisId, java.util.Arrays.hashCode(assetSha256), role);
        }
    }
}
