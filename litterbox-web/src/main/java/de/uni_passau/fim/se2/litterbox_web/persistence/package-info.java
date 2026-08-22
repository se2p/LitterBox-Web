/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
@ApplicationModule(
    allowedDependencies = { "shared" },
    type = ApplicationModule.Type.CLOSED
)
// todo: Whole package is a horrible hodgepodge of slop where nobody can have any idea of what is
// actually going on. See DatabaseWork and Idempotent classes for examples. Tries to emulate some
// transactional stuff in Java code instead of just putting the data into the database and letting
// the DB handle that? The database queries should be short enough so that we do not have to care
// about blocking. _IF_ we really do, then use a spring-boot-starter-data-r2dbc/hibernate-reactive
// R2dbcRepository instead of a JpaRepository.
// _All_ repositories will need to be cleaned up accordingly once someone reverse engineered what
// the DatabaseWork/Idempotent/… classes were originally intended for.
package de.uni_passau.fim.se2.litterbox_web.persistence;

import org.springframework.modulith.ApplicationModule;
