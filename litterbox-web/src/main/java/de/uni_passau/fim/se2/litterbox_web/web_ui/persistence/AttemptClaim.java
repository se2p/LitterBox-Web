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

public record AttemptClaim(Outcome outcome, AssessmentAttempt attempt) {

    public AttemptClaim {
        Objects.requireNonNull(outcome, "outcome");
    }

    public enum Outcome {

        OPENED,

        UNAVAILABLE,

        EXHAUSTED
    }

    public static AttemptClaim opened(final AssessmentAttempt attempt) {
        return new AttemptClaim(Outcome.OPENED, Objects.requireNonNull(attempt, "attempt"));
    }

    public static AttemptClaim unavailable() {
        return new AttemptClaim(Outcome.UNAVAILABLE, null);
    }

    public static AttemptClaim exhausted() {
        return new AttemptClaim(Outcome.EXHAUSTED, null);
    }
}
