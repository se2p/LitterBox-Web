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

import java.io.Serial;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A {@link TransactionTemplate} fixed at {@code READ COMMITTED}: the isolation policy for the multi-statement writes in
 * this package and for the statistics projection.
 *
 * <p>
 * Nothing else sets an isolation level, so without this these transactions would run at the connection default, which
 * for InnoDB — and so MariaDB — is {@code REPEATABLE READ}. There, a <em>consistent non-locking</em> read is served
 * from the snapshot established by the transaction's first such read, so a {@code SELECT} later in the transaction can
 * describe rows as they stood when that first consistent read ran. {@code READ COMMITTED} takes a fresh committed
 * snapshot per statement, which is what these transactions want: less stale reads, given that several workers run them
 * at once against the same job, submission and analysis rows.
 *
 * <p>
 * It does not make a read and a later write agree. Each statement sees what was committed when it ran, so another
 * transaction may still commit between the two, and nothing here may assume the row a {@code SELECT} returned is the
 * row the following {@code UPDATE} meets.
 *
 * <p>
 * Correctness under concurrency comes from the writes being guarded rather than from the isolation level: the condition
 * a decision was made on is repeated in the statement's own {@code WHERE} clause, and the affected-row count says
 * whether it still held. {@code AnalysisJobs.releaseForRetry}, {@code AnalysisJobs.finish} and
 * {@code Submissions.cancelIfActive} are written this way, and their callers treat a count other than one as having
 * lost the race.
 *
 * <p>
 * It applies only where it is used explicitly. The {@code @Transactional} queries on the Spring Data interfaces in
 * {@code jpa}, {@code AnalysisJobs.claimNext} included, run in transactions of their own at the connection default.
 */
@Component
public class ReadCommittedTransactions extends TransactionTemplate {

    @Serial
    private static final long serialVersionUID = 1L;

    public ReadCommittedTransactions(final PlatformTransactionManager transactionManager) {
        super(transactionManager);
        setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }
}
