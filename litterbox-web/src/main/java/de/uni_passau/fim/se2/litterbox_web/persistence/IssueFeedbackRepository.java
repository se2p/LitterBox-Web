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

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.IssueFeedbacks;
import reactor.core.publisher.Mono;

@Repository
public class IssueFeedbackRepository {

    private final IssueFeedbacks feedback;
    private final DatabaseWork databaseWork;

    public IssueFeedbackRepository(final IssueFeedbacks feedback, final DatabaseWork databaseWork) {
        this.feedback = Objects.requireNonNull(feedback, "feedback");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<Void> upsert(final long analysisId, final String finderName, final IssueFeedbackReaction reaction) {
        Objects.requireNonNull(finderName, "finderName");
        Objects.requireNonNull(reaction, "reaction");
        return databaseWork.submit(() -> {
            feedback.upsert(analysisId, finderName, reaction.storageValue());
            return null;
        });
    }
}
