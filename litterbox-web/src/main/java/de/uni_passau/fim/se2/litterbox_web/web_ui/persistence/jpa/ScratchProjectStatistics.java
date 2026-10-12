/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.ScratchProjectStatsEntity;

public interface ScratchProjectStatistics extends JpaRepository<ScratchProjectStatsEntity, Long> {

    /**
     * Fetching what Scratch says about a project can happen more than once for the same analysis, and the newest answer
     * is the one to keep.
     *
     * @param analysisId       analysis owning the statistics
     * @param views            view count
     * @param loves            love count
     * @param favorites        favorite count
     * @param remixes          remix count
     * @param author           author name
     * @param usernameSource   source of the username
     * @param scratchCreatedAt Scratch creation time
     * @param fetchedAt        retrieval time
     */
    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO scratch_project_stats (analysis_id, views, loves, favorites, remixes, author_username, "
            + "username_source, scratch_created_at, fetched_at) VALUES (:analysisId, "
            + ":views, :loves, :favorites, :remixes, :author, :usernameSource, :scratchCreatedAt, :fetchedAt) "
            + "ON DUPLICATE KEY UPDATE views = VALUES(views), loves = VALUES(loves), "
            + "favorites = VALUES(favorites), remixes = VALUES(remixes), "
            + "author_username = VALUES(author_username), username_source = VALUES(username_source), "
            + "scratch_created_at = VALUES(scratch_created_at), fetched_at = VALUES(fetched_at)",
        nativeQuery = true
    )
    @SuppressWarnings("checkstyle:ParameterNumber")
    void upsert(
        @Param("analysisId") long analysisId,
        @Param("views") Long views,
        @Param("loves") Long loves,
        @Param("favorites") Long favorites,
        @Param("remixes") Long remixes,
        @Param("author") String author,
        @Param("usernameSource") String usernameSource,
        @Param("scratchCreatedAt") Instant scratchCreatedAt,
        @Param("fetchedAt") Instant fetchedAt
    );
}
