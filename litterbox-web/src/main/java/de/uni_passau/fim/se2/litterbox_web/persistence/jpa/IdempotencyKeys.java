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

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.IdempotencyKeyEntity;

public interface IdempotencyKeys extends JpaRepository<IdempotencyKeyEntity, IdempotencyKeyEntity.Key> {

    Optional<IdempotencyKeyEntity> findByScopeAndIdempotencyKey(String scope, String idempotencyKey);

    /**
     * Binds a key to a submission, once. A key already bound is refused by the primary key.
     *
     * <p>
     * Written as a statement because saving the entity is not this. The key is the scope and the key itself, both
     * supplied by the caller, so Hibernate cannot tell a new row from a stored one and looks first — and on finding the
     * row a request already bound, it writes over it. A second request would then quietly take a key that was not its
     * own, and the digest that says whether the two requests were even the same would be replaced along with it.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "INSERT INTO idempotency_key "
            + "(scope, idempotency_key, request_fingerprint, submission_id) "
            + "VALUES (:scope, :key, :fingerprint, :submissionId)",
        nativeQuery = true
    )
    void bind(
        @Param("scope") String scope,
        @Param("key") String key,
        @Param("fingerprint") byte[] fingerprint,
        @Param("submissionId") long submissionId
    );
}
