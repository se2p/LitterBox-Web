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

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The transactions this project's writes run in.
 *
 * <p>
 * A write that says what it expects to find is only safe to retry if the retry can see what changed it. Under the
 * database's default isolation a transaction keeps the snapshot it began with, so a writer that lost a race would
 * re-read its own stale numbers however many times it tried. Read committed gives each statement a fresh view.
 */
// todo: why needed?
@Component
public class ReadCommittedTransactions extends TransactionTemplate {

    private static final long serialVersionUID = 1L;

    public ReadCommittedTransactions(final PlatformTransactionManager transactionManager) {
        super(transactionManager);
        setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }
}
