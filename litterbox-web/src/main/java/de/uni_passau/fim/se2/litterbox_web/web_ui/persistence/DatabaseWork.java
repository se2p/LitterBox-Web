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

import java.util.concurrent.Callable;

import reactor.core.publisher.Mono;

// todo: ?????????????
// todo: Why is this needed? Why do the repositories hand off database stuff to another thread instead of just writing
//  the data to the DB? Is this a remnant of the first iteration using plain SQL queries rather than proper JPA?
public interface DatabaseWork {

    <T> Mono<T> submit(Callable<T> task);
}
