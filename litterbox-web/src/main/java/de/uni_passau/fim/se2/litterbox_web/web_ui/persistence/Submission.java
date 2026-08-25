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

public record Submission(
    long id,
    String shareToken,
    String sourceType,
    String locale,
    String state,
    String retentionState,
    int expectedCount,
    int completedCount,
    int failedCount
) {

    /** Whether this submission has come to something, and so has no work left that anybody should start. */
    public boolean terminal() {
        return switch (state) {
            case "COMPLETED", "PARTIAL", "FAILED", "CANCELLED" -> true;
            default -> false;
        };
    }

    /**
     * Whether everything the submission was created to hold is now under it.
     *
     * <p>
     * A submission is created in one state and moved out of it by the last step of the building, so one still in the
     * initial state had its creation stop part way. That is what a request repeated after a failure finds, and the only
     * case in which such a request has anything left to do.
     */
    public boolean built() {
        return !"STORED".equals(state);
    }
}
