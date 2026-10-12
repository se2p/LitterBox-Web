/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.util.Objects;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.IdempotencyKeyEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.IdempotencyKeys;
import reactor.core.publisher.Mono;

@Repository
public class IdempotencyKeyRepository {

    private final IdempotencyKeys keys;
    private final DatabaseWork databaseWork;

    public IdempotencyKeyRepository(final IdempotencyKeys keys, final DatabaseWork databaseWork) {
        this.keys = Objects.requireNonNull(keys, "keys");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    /**
     * Finds the record currently bound to an idempotency key, if any.
     *
     * @param scope idempotency scope
     * @param key   idempotency key
     * @return bound record, if any
     */
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
     * The returned record is whichever submission the key ended up standing for, which is not necessarily
     * {@code submissionId}: two requests carrying the same key can both find it unused and both build a submission, and
     * only one of them can have it. Callers must check what comes back, because the loser is left holding a submission
     * that will never be shown.
     *
     * @param fingerprint  identifies this request; the only thing two requests are compared by
     * @param scope        logical namespace of the key
     * @param key          client-provided idempotency key
     * @param submissionId submission bound to this key
     * @return the record bound by this call or the existing record
     */
    public Mono<IdempotencyRecord> put(
        final String scope, final String key, final byte[] fingerprint, final long submissionId
    ) {
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(fingerprint, "fingerprint");
        // Callers should already have refused an oversized key before reading the request body, which is the only
        // point at which refusing costs nothing. Re-checking here means a caller that forgot finds out now, rather
        // than from a failed insert with a submission already built under it.
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
            // Repeating the same request is what the key is for; sending a different one under it is not.
            //
            // This look-up is a statement of its own, running after the failed insert has been abandoned, which is
            // what lets it see the row that caused the failure. Inside that transaction it would not be visible.
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
