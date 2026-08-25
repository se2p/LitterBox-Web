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

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Submissions;

/**
 * How far along a submission is, and what state that puts it in.
 *
 * <p>
 * Needs neither a lock nor a prior read: counting a project is a single statement that increments the row and derives
 * the resulting state from it. However many workers finish at the same moment, each counts exactly once and none waits
 * on a decision another is making.
 *
 * @see Submissions#countOutcome
 */
final class SubmissionProgress {

    private final Submissions submissions;

    SubmissionProgress(final Submissions submissions) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
    }

    /** What a submission's counts add up to, and the state that follows from them. */
    record Counts(String state, int expected, int completed, int failed) {

        boolean finished() {
            return "CANCELLED".equals(state) || completed + failed >= expected;
        }
    }

    Counts counts(final long submissionId) {
        return submissions.readCounts(submissionId)
            .map(row -> new Counts(row.getState(), row.getExpected(), row.getCompleted(), row.getFailed()))
            .orElseThrow(() -> new IllegalStateException("Submission " + submissionId + " does not exist"));
    }

    /**
     * Counts one finished piece of work against its submission.
     *
     * @return whether this call was the one that counted it
     */
    boolean recordOutcome(final long submissionId, final boolean failed) {
        return submissions.countOutcome(submissionId, failed ? 0 : 1, failed ? 1 : 0) == 1;
    }

    /**
     * Records a failure that stands for the submission as a whole.
     *
     * @param onlyWhileRunning whether a submission that has already come to something should be left alone
     * @return whether this call was the one that recorded it
     * @see Submissions#countFailure
     */
    boolean recordFailure(final long submissionId, final boolean onlyWhileRunning) {
        return submissions.countFailure(submissionId, onlyWhileRunning) == 1;
    }
}
