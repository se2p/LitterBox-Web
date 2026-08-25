/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
/**
 * Everything a submission made through the web UI is stored in: the submission itself, its analyses and their
 * measurements, the job queue that runs them, and the uploaded archives and generated assets they refer to.
 *
 * <h2>Layout</h2>
 *
 * <ul>
 * <li>{@code entity} — the JPA entities, one per table.
 * <li>{@code jpa} — the Spring Data repositories over those entities. They speak in entities, and entities do not leave
 * this package.
 * <li>this package — one {@code @Repository} class per aggregate, wrapping the Spring Data interfaces it needs and
 * returning records rather than entities.
 * </ul>
 *
 * <h2>Why repository methods return {@code Mono}</h2>
 *
 * <p>
 * Persistence here is ordinary synchronous Spring Data JPA over JDBC. The web layer is not: this application is WebFlux
 * ({@code @EnableWebFlux} on {@code LitterboxWebApplication}) on Netty, where a handler's publisher is subscribed on an
 * event loop and there are only as many of those as the machine has cores. Blocking one of them stalls every other
 * request it is carrying.
 *
 * <p>
 * A JDBC call may block for as long as it takes to check a connection out of the pool, reach the database over the
 * network, wait behind a lock and read the result back, none of which is bounded by how quick the query itself is. A
 * statement that is normally fast is therefore still not safe to run on an event-loop thread.
 *
 * <p>
 * The repositories consequently hand their work to {@link DatabaseWork}, which runs it on a pool of its own and returns
 * a {@code Mono}. {@code Mono.fromCallable(…).subscribeOn(…)} is the conventional bridge between a blocking API and a
 * reactive one; nothing here is trying to make the database itself faster.
 *
 * <p>
 * The pool is bounded to about the size of the JDBC connection pool, since anything queued beyond that is only waiting
 * for a connection. When it is full callers get a {@link DatabaseCapacityExceededException} rather than an unbounded
 * queue.
 *
 * <p>
 * Moving to R2DBC or Hibernate Reactive would remove the bridge, but it is a migration to a different persistence
 * architecture — different entities, different queries, a different driver — rather than a tidying of this one.
 *
 * <h2>Transactions and concurrency</h2>
 *
 * <p>
 * Most repository methods are a single statement, which Spring Data still runs in a transaction of its own; what they
 * do not need is one spanning several statements. Where several statements do have to agree they run inside
 * {@link ReadCommittedTransactions}, which says why the isolation level is set explicitly. Writes whose only expected
 * failure is being a repeat go through {@link Idempotent}. Both are helpers for the concurrency these writes meet, not
 * stand-ins for anything JPA offers.
 */
@ApplicationModule(
    allowedDependencies = { "shared", "web_ui.support" },
    type = ApplicationModule.Type.CLOSED
)
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import org.springframework.modulith.ApplicationModule;
