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

/** Maps the {@code idempotency_key} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "idempotency_key")
@IdClass(IdempotencyKeyEntity.Key.class)
public class IdempotencyKeyEntity {

    @Id
    @Column(name = "scope")
    private String scope;

    @Id
    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(
        name = "request_fingerprint",
        columnDefinition = "BINARY(32)"
    )
    private byte[] requestFingerprint;

    @Column(name = "submission_id")
    private long submissionId;

    public String getScope() {
        return scope;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public byte[] getRequestFingerprint() {
        return requestFingerprint;
    }

    public long getSubmissionId() {
        return submissionId;
    }

    /** The columns that together name a row. */
    public static final class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private String scope;
        private String idempotencyKey;

        public Key() {
        }

        public Key(final String scope, final String idempotencyKey) {
            this.scope = scope;
            this.idempotencyKey = idempotencyKey;
        }

        @Override
        public boolean equals(final Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return Objects.equals(scope, key.scope)
                && Objects.equals(idempotencyKey, key.idempotencyKey);
        }

        @Override
        public int hashCode() {
            return Objects.hash(scope, idempotencyKey);
        }
    }
}
