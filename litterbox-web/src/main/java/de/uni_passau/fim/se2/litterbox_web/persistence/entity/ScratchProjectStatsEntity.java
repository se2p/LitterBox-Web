/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code scratch_project_stats} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "scratch_project_stats")
public class ScratchProjectStatsEntity {

    @Id
    @Column(name = "analysis_id")
    private Long analysisId;

    @Column(name = "views")
    private Long views;

    @Column(name = "loves")
    private Long loves;

    @Column(name = "favorites")
    private Long favorites;

    @Column(name = "remixes")
    private Long remixes;

    @Column(name = "author_username")
    private String authorUsername;

    @Column(name = "username_source")
    private String usernameSource;

    @Column(name = "scratch_created_at")
    private Instant scratchCreatedAt;

    @Column(name = "fetched_at")
    private Instant fetchedAt;

}
