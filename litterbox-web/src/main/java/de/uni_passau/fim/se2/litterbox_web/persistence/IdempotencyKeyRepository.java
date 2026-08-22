/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

import java.util.Objects;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.IdempotencyKeyEntity;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.IdempotencyKeys;
import reactor.core.publisher.Mono;

@Repository
public class IdempotencyKeyRepository {

    private final IdempotencyKeys keys;
    private final DatabaseWork databaseWork;

    public IdempotencyKeyRepository(final IdempotencyKeys keys, final DatabaseWork databaseWork) {
        this.keys = Objects.requireNonNull(keys, "keys");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<IdempotencyRecord> find(final String scope, final String key) {
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(key, "key");
        RequestStrings.checkIdempotency(scope, key);
        return databaseWork.submit(
            () -> keys.findByScopeAndIdempotencyKey(scope, key).map(IdempotencyKeyRepository::toRecord).orElse(null)
        );
    }

    /**
     * Binds the key to a submission, or reports which submission it is already bound to.
     *
     * <p>
     * The returned record is the one the key stands for, which is not necessarily the one asked for here: two requests
     * carrying the same key can both find it unused and both go on to build a submission, and only one of them can have
     * it. Callers have to look at what comes back — the caller that loses is holding a submission nobody will ever be
     * shown.
     *
     * @param fingerprint what this request is, and the only thing two requests are compared by
     */
    public Mono<IdempotencyRecord> put(
        final String scope, final String key, final byte[] fingerprint, final long submissionId
    ) {
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(fingerprint, "fingerprint");
        // Callers are expected to have refused an oversized key before reading the request, which is the only place it
        // can be refused for free. Saying so again here is what keeps a caller that forgets from finding out from a
        // failed insert, with a submission already built under it.
        RequestStrings.checkIdempotency(scope, key);
        checkDigest(fingerprint);
        return databaseWork.submit(() -> putRecord(scope, key, fingerprint, submissionId));
    }

    private static void checkDigest(final byte[] digest) {
        if (digest.length != 32) {
            throw new IllegalArgumentException("SHA-256 digest must contain 32 bytes");
        }
    }

    private IdempotencyRecord putRecord(
        final String scope,
        final String key,
        final byte[] fingerprint,
        final long submissionId
    ) {
        try {
            keys.bind(scope, key, fingerprint, submissionId);
        }
        catch (DataIntegrityViolationException alreadyUsed) {
            // Sending the same request twice is the point of the key. Sending a different one under it is not.
            //
            // The look-up is a statement of its own and so begins after the failed insert has been given up on,
            // which is what lets it see the row that caused the failure. Read inside that transaction it would not
            // have been there.
            final IdempotencyRecord existing = keys.findByScopeAndIdempotencyKey(scope, key)
                .map(IdempotencyKeyRepository::toRecord)
                .orElseThrow(() -> alreadyUsed);
            if (!java.util.Arrays.equals(existing.requestFingerprint(), fingerprint)) {
                throw new IdempotencyConflictException(scope, key);
            }
            return existing;
        }
        return new IdempotencyRecord(scope, key, fingerprint, submissionId);
    }

    private static IdempotencyRecord toRecord(final IdempotencyKeyEntity entity) {
        return new IdempotencyRecord(
            entity.getScope(), entity.getIdempotencyKey(), entity.getRequestFingerprint(),
            entity.getSubmissionId()
        );
    }

    public record IdempotencyRecord(
        String scope, String key, byte[] requestFingerprint, long submissionId
    ) {

        public IdempotencyRecord {
            requestFingerprint = requestFingerprint.clone();
        }

        @Override
        public byte[] requestFingerprint() {
            return requestFingerprint.clone();
        }
    }

    public static final class IdempotencyConflictException extends RuntimeException {

        public IdempotencyConflictException(final String scope, final String key) {
            super("Idempotency key is already bound to a different request: " + scope + "/" + key);
        }
    }
}
